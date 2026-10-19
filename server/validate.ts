import { isAssistantModel } from "../lib/assistant-models";
import { isEmail, normalizeEmail, nameFromEmail } from "../lib/format";
import { presetFor } from "../lib/providers";
import {
  isProviderId,
  isThreadAction,
  type AliasInput,
  type ConnectAccountInput,
  type SendMessageInput,
  type ThreadAction,
} from "../lib/mail-types";
import { MailError } from "./errors";

function objectOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value.trim() : null;
}

function readEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const emails: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const email = normalizeEmail(item);
    if (!isEmail(email) || emails.includes(email)) continue;
    emails.push(email);
  }
  return emails;
}

function readAliases(value: unknown, primary: string): AliasInput[] {
  if (!Array.isArray(value)) return [];
  const aliases: AliasInput[] = [];
  for (const item of value) {
    const record = objectOf(item);
    if (!record) continue;
    const email = normalizeEmail(readString(record, "email") ?? "");
    if (!isEmail(email) || email === primary || aliases.some((alias) => alias.email === email)) {
      continue;
    }
    const displayName = readString(record, "displayName") || nameFromEmail(email);
    aliases.push({ email, displayName });
  }
  return aliases;
}

export function readConnectInput(value: unknown): ConnectAccountInput {
  const record = objectOf(value);
  if (!record) throw new MailError("Enter the account details.");
  const providerValue = readString(record, "provider") ?? "";
  if (!isProviderId(providerValue)) throw new MailError("Choose iCloud, Gmail, or IMAP.");
  const preset = presetFor(providerValue);
  const email = normalizeEmail(readString(record, "email") ?? "");
  if (!isEmail(email)) throw new MailError("Enter a valid email address.");
  const password = readString(record, "password") ?? "";
  if (password.length < 4) throw new MailError("Enter the app-specific password.");
  const displayName = readString(record, "displayName") || nameFromEmail(email);
  const username = normalizeEmail(readString(record, "username") || email);

  const imapHost = readString(record, "imapHost") || preset.imapHost;
  const smtpHost = readString(record, "smtpHost") || preset.smtpHost;
  const imapPortValue = record.imapPort;
  const smtpPortValue = record.smtpPort;
  const imapPort =
    typeof imapPortValue === "number" && imapPortValue > 0 ? imapPortValue : preset.imapPort;
  const smtpPort =
    typeof smtpPortValue === "number" && smtpPortValue > 0 ? smtpPortValue : preset.smtpPort;
  const smtpSecure =
    typeof record.smtpSecure === "boolean" ? record.smtpSecure : preset.smtpSecure;

  if (!imapHost || !smtpHost) throw new MailError("Enter the IMAP and SMTP hostnames.");

  return {
    provider: providerValue,
    email,
    displayName,
    password,
    username,
    imapHost,
    imapPort,
    smtpHost,
    smtpPort,
    smtpSecure,
    aliases: readAliases(record.aliases, email),
  };
}

export function readAliasInput(value: unknown): AliasInput {
  const record = objectOf(value);
  if (!record) throw new MailError("Enter the alias.");
  const email = normalizeEmail(readString(record, "email") ?? "");
  if (!isEmail(email)) throw new MailError("Enter a valid alias address.");
  const displayName = readString(record, "displayName") || nameFromEmail(email);
  return { email, displayName };
}

export function readAction(value: unknown): ThreadAction {
  const record = objectOf(value);
  const action = record ? readString(record, "action") : null;
  if (!action || !isThreadAction(action)) throw new MailError("Unknown action.");
  return action;
}

export function readSendInput(value: unknown): SendMessageInput {
  const record = objectOf(value);
  if (!record) throw new MailError("Write a message first.");
  const accountId = readString(record, "accountId") ?? "";
  const identityId = readString(record, "identityId") ?? "";
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const to = readEmails(record.to);
  if (!accountId || !identityId) throw new MailError("Choose an address to send from.");
  if (to.length === 0) throw new MailError("Add at least one recipient.");
  if (!text) throw new MailError("Write a message first.");
  const replyToMessageId = readString(record, "replyToMessageId") ?? undefined;
  return {
    accountId,
    identityId,
    to,
    cc: readEmails(record.cc),
    bcc: readEmails(record.bcc),
    subject,
    text,
    replyToMessageId,
  };
}

export function readAssistantSettings(value: unknown): { apiKey?: string; model?: string } {
  const record = objectOf(value);
  if (!record) throw new MailError("Enter the assistant settings.");
  const apiKey = readString(record, "apiKey");
  const model = readString(record, "model");
  if (apiKey !== null && apiKey.length > 0 && (apiKey.length < 12 || apiKey.length > 300)) {
    throw new MailError("That OpenRouter key does not look right.");
  }
  if (model && !isAssistantModel(model)) throw new MailError("Choose an OpenRouter model id.");
  return {
    ...(apiKey !== null ? { apiKey } : {}),
    ...(model ? { model } : {}),
  };
}

export function readRewrite(value: unknown): { instruction: string; text: string; subject: string } {
  const record = objectOf(value);
  if (!record) throw new MailError("Write a draft first.");
  const instruction = readString(record, "instruction") ?? "";
  const text = readString(record, "text") ?? "";
  const subject = readString(record, "subject") ?? "";
  const context = readString(record, "context") ?? "";
  if (!instruction) throw new MailError("Say what the message should say.");
  return { instruction, text, subject, context };
}

export function readAsk(value: unknown): string {
  const record = objectOf(value);
  const prompt = record ? readString(record, "prompt") : null;
  if (!prompt) throw new MailError("Ask something about your mail.");
  return prompt;
}

export function ftsQuery(value: string): string | null {
  const tokens = value
    .toLowerCase()
    .split(/[^\p{L}\p{N}@.]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token.replaceAll('"', "")}"*`).join(" ");
}
