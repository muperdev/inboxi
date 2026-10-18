import type { ImapFlow, ListResponse } from "imapflow";
import type { FolderRole } from "../lib/mail-types";
import { notify } from "./bus";
import { initialUidWindow, mailDb, type SyncFolder } from "./db";
import { messageFromEnvelope, normalizeMessageId, parseMail } from "./parse-mail";

const skippedSpecialUse = new Set(["\\All", "\\Flagged", "\\Important"]);

function roleFor(mailbox: ListResponse): FolderRole | null {
  const special = mailbox.specialUse ?? "";
  if (skippedSpecialUse.has(special)) return null;
  switch (special) {
    case "\\Inbox":
      return "inbox";
    case "\\Sent":
      return "sent";
    case "\\Drafts":
      return "drafts";
    case "\\Trash":
      return "trash";
    case "\\Junk":
      return "junk";
    case "\\Archive":
      return "archive";
    default:
      break;
  }

  const name = mailbox.name.toLowerCase();
  const path = mailbox.path.toLowerCase();
  if (path.includes("all mail") || path.includes("important") || path.includes("starred")) {
    return null;
  }
  if (path === "inbox" || name === "inbox") return "inbox";
  if (name === "sent" || name === "sent messages" || name === "sent mail") return "sent";
  if (name === "drafts" || name === "draft") return "drafts";
  if (name === "trash" || name === "deleted" || name === "deleted messages") return "trash";
  if (name === "archive") return "archive";
  if (name === "junk" || name === "spam") return "junk";
  return null;
}

export async function discoverFolders(client: ImapFlow, accountId: string): Promise<void> {
  const mailboxes = await client.list();
  for (const mailbox of mailboxes) {
    if (mailbox.flags.has("\\Noselect")) continue;
    const role = roleFor(mailbox);
    if (!role) continue;
    mailDb.upsertFolder(accountId, mailbox.path, mailbox.name, role);
  }
}

function chunks(values: number[], size: number): number[][] {
  const groups: number[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }
  return groups;
}

export async function syncFolder(
  client: ImapFlow,
  accountId: string,
  folder: SyncFolder,
): Promise<void> {
  const lock = await client.getMailboxLock(folder.path);
  try {
    if (!client.mailbox) return;
    const uidValidity = client.mailbox.uidValidity.toString();
    const uidNext = client.mailbox.uidNext;
    mailDb.noteValidity(folder.id, uidValidity);
    if (client.mailbox.exists === 0 || uidNext <= 1) return;

    const stored = mailDb.syncFolders(accountId).find((item) => item.id === folder.id);
    const lastUid = stored?.lastUid ?? folder.lastUid;
    const start =
      lastUid > 0 ? lastUid + 1 : Math.max(1, uidNext - initialUidWindow(folder.role));
    if (start < uidNext) {
      let seen = 0;
      for await (const message of client.fetch(
        `${start}:*`,
        { uid: true, flags: true, source: true, size: true, internalDate: true, envelope: true },
        { uid: true },
      )) {
        try {
          const oversized = (message.size ?? 0) > 1_500_000 || !message.source;
          const parsed = oversized
            ? {
                ...messageFromEnvelope({
                  subject: message.envelope?.subject,
                  from: message.envelope?.from,
                  to: message.envelope?.to,
                  date: message.envelope?.date ?? message.internalDate,
                  flags: message.flags,
                }),
                messageId: normalizeMessageId(message.envelope?.messageId),
              }
            : await parseMail(message.source, message.flags, message.internalDate);
          mailDb.upsertMessage(accountId, folder.id, message.uid, parsed);
          seen += 1;
          if (seen % 8 === 0) notify();
        } catch (error) {
          const reason = error instanceof Error ? error.message : "unknown error";
          console.error(`Skipped a message in ${folder.path}: ${reason}`);
        }
      }
    }

    const recentStart = Math.max(1, uidNext - 40);
    for await (const message of client.fetch(
      `${recentStart}:*`,
      { uid: true, flags: true },
      { uid: true },
    )) {
      if (!message.flags) continue;
      mailDb.updateFlags(
        folder.id,
        message.uid,
        !message.flags.has("\\Seen"),
        message.flags.has("\\Flagged"),
      );
    }

    const localUids = mailDb.uidsInFolder(folder.id).slice(0, 400);
    for (const group of chunks(localUids, 150)) {
      const found = await client.search({ uid: group.join(",") }, { uid: true });
      if (!Array.isArray(found)) continue;
      const remote = new Set(found);
      for (const uid of group) {
        if (!remote.has(uid)) mailDb.deleteByUid(folder.id, uid);
      }
    }
  } finally {
    lock.release();
  }
}
