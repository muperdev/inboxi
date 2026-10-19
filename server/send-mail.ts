import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import type { Address, SendMessageInput } from "../lib/mail-types";
import { notify } from "./bus";
import { mailDb } from "./db";
import { MailError } from "./errors";
import { accessTokenFor, isGoogleRefresh } from "./google-auth";
import { keepsSentCopy } from "./imap";
import { normalizeMessageId, textToHtml } from "./parse-mail";
import { enqueueAccount } from "./runtime";

type SmtpAccount = {
  provider: "icloud" | "gmail" | "imap";
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
};

async function transportFor(account: SmtpAccount) {
  const auth = isGoogleRefresh(account.password)
    ? {
        type: "OAuth2" as const,
        user: account.username,
        accessToken: await accessTokenFor(account.password),
      }
    : { user: account.username, pass: account.password };
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    requireTLS: !account.smtpSecure,
    auth,
  });
}

export async function verifySmtp(account: SmtpAccount): Promise<void> {
  const transport = await transportFor(account);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

function replySubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^re:/i.test(trimmed)) return trimmed;
  return trimmed.length > 0 ? `Re: ${trimmed}` : "Re:";
}

export async function sendMessage(input: SendMessageInput): Promise<{ threadId: string }> {
  const secret = mailDb.getSecret(input.accountId);
  if (!secret) throw new MailError("That account is not connected.");
  const identity = mailDb.identityFor(input.accountId, input.identityId);
  if (!identity) throw new MailError("Choose an address to send from.");

  const reply = input.replyToMessageId ? mailDb.replySource(input.replyToMessageId) : null;
  if (input.replyToMessageId && (!reply || reply.accountId !== input.accountId)) {
    throw new MailError("That conversation is gone.");
  }

  const domain = identity.email.split("@")[1] ?? "localhost";
  const messageId = `${crypto.randomUUID()}@${domain}`;
  const inReplyTo = reply?.messageId ?? null;
  const references = reply
    ? [...reply.references, reply.messageId].filter((id): id is string => Boolean(id))
    : [];
  const subject = reply ? replySubject(reply.subject) : input.subject;
  const html = textToHtml(input.text);
  const from: Address = { name: identity.displayName, email: identity.email };
  const to = input.to.map((email) => ({ name: "", email }));
  const cc = input.cc.map((email) => ({ name: "", email }));

  const composer = new MailComposer({
    from: { name: from.name, address: from.email },
    to: to.map((address) => address.email),
    cc: cc.map((address) => address.email),
    bcc: input.bcc,
    subject,
    text: input.text,
    html,
    messageId: `<${messageId}>`,
    inReplyTo: inReplyTo ? `<${inReplyTo}>` : undefined,
    references: references.map((id) => `<${id}>`),
  });
  const raw = await composer.compile().build();

  const transport = await transportFor(secret);
  try {
    await transport.sendMail({
      raw,
      envelope: {
        from: identity.email,
        to: [...input.to, ...input.cc, ...input.bcc],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send.";
    throw new MailError(message.length < 220 ? message : "Could not send that message.");
  } finally {
    transport.close();
  }

  const threadId = mailDb.insertOutgoing({
    accountId: input.accountId,
    from,
    to,
    cc,
    subject,
    text: input.text,
    html,
    messageId: normalizeMessageId(messageId) ?? messageId,
    inReplyTo,
    references,
    threadId: reply?.threadId ?? null,
  });
  mailDb.recount(input.accountId);
  notify();

  void enqueueAccount(input.accountId, async (client) => {
    const sent = mailDb.folderByRole(input.accountId, "sent");
    if (!sent) return;
    if (!keepsSentCopy(secret.provider)) {
      const lock = await client.getMailboxLock(sent.path);
      try {
        await client.append(sent.path, raw, ["\\Seen"]);
      } finally {
        lock.release();
      }
    }
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Could not save the sent copy.";
    console.error(message);
  });

  return { threadId };
}
