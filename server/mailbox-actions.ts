import type { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { FolderRole, ThreadAction } from "../lib/mail-types";
import { notify } from "./bus";
import { mailDb } from "./db";
import { MailError } from "./errors";
import { enqueueAccount } from "./runtime";

function groupByFolder<T extends { folderPath: string }>(messages: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const message of messages) {
    const group = groups.get(message.folderPath) ?? [];
    group.push(message);
    groups.set(message.folderPath, group);
  }
  return groups;
}

async function withFolder<T>(
  client: ImapFlow,
  path: string,
  task: () => Promise<T>,
): Promise<T> {
  const lock = await client.getMailboxLock(path);
  try {
    return await task();
  } finally {
    lock.release();
  }
}

export async function applyThreadAction(threadId: string, action: ThreadAction): Promise<void> {
  const accountId = mailDb.threadAccountId(threadId);
  if (!accountId) throw new MailError("That conversation is gone.");
  const messages = mailDb.threadMessages(threadId);
  if (messages.length === 0) throw new MailError("That conversation is gone.");

  await enqueueAccount(accountId, async (client) => {
    if (action === "read" || action === "unread" || action === "star" || action === "unstar") {
      const flag = action === "star" || action === "unstar" ? "\\Flagged" : "\\Seen";
      const add = action === "read" || action === "star";
      for (const [path, group] of groupByFolder(messages)) {
        const uids = group.map((message) => message.imapUid).filter((uid) => uid > 0);
        if (uids.length === 0) continue;
        await withFolder(client, path, async () => {
          const changed = add
            ? await client.messageFlagsAdd(uids, [flag], { uid: true })
            : await client.messageFlagsRemove(uids, [flag], { uid: true });
          if (!changed) throw new MailError("The mail server rejected the change.");
        });
      }
      mailDb.applyFlags(threadId, action);
      return;
    }

    if (action === "delete") {
      for (const [path, group] of groupByFolder(messages)) {
        const uids = group.map((message) => message.imapUid).filter((uid) => uid > 0);
        if (uids.length === 0) continue;
        await withFolder(client, path, async () => {
          const deleted = await client.messageDelete(uids, { uid: true });
          if (!deleted) throw new MailError("The mail server rejected the delete.");
        });
      }
      mailDb.deleteThread(threadId);
      return;
    }

    const role: FolderRole = action === "archive" ? "archive" : "trash";
    const destination = mailDb.folderByRole(accountId, role);
    if (!destination) {
      throw new MailError(
        role === "archive"
          ? "This account has no Archive folder."
          : "This account has no Trash folder.",
      );
    }

    for (const [path, group] of groupByFolder(messages)) {
      await withFolder(client, path, async () => {
        for (const message of group) {
          if (message.folderId === destination.id) continue;
          if (message.imapUid <= 0) {
            mailDb.relocateMessage(message.id, destination.id, message.imapUid);
            continue;
          }
          const moved = await client.messageMove(String(message.imapUid), destination.path, {
            uid: true,
          });
          if (!moved) throw new MailError("The mail server rejected the move.");
          const nextUid = moved.uidMap?.get(message.imapUid) ?? -Date.now();
          mailDb.relocateMessage(message.id, destination.id, nextUid);
        }
      });
    }
  });

  mailDb.recount(accountId);
  notify();
}

export async function downloadAttachment(
  messageId: string,
  index: number,
): Promise<{ filename: string; contentType: string; bytes: Buffer }> {
  const source = mailDb.attachmentSource(messageId, index);
  if (!source) throw new MailError("That attachment is gone.");

  return enqueueAccount(source.accountId, async (client) => {
    return withFolder(client, source.folderPath, async () => {
      let uid = source.imapUid;
      if (uid <= 0 && source.messageId) {
        const found = await client.search(
          { header: { "message-id": `<${source.messageId}>` } },
          { uid: true },
        );
        const first = Array.isArray(found) ? found[0] : undefined;
        if (first) uid = first;
      }
      if (uid <= 0) throw new MailError("That file isn't on the server yet.");
      const downloaded = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!downloaded || !downloaded.source) throw new MailError("Could not download that file.");
      const parsed = await simpleParser(downloaded.source);
      const attachment = parsed.attachments[index];
      if (!attachment) throw new MailError("That attachment is gone.");
      return {
        filename: attachment.filename ?? source.filename,
        contentType: attachment.contentType || source.contentType,
        bytes: attachment.content,
      };
    });
  });
}
