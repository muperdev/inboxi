import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import sanitizeHtml from "sanitize-html";
import type { Address, Attachment } from "../lib/mail-types";

export type ParsedMessage = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  from: Address;
  to: Address[];
  cc: Address[];
  date: number;
  snippet: string;
  bodyText: string;
  bodyHtml: string | null;
  unread: boolean;
  starred: boolean;
  attachments: Attachment[];
  addresses: string[];
};

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "span",
    "font",
    "center",
    "h1",
    "h2",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    "*": ["style", "align", "width", "height", "class"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noreferrer noopener",
      target: "_blank",
    }),
  },
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function normalizeMessageId(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^<|>$/g, "").toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function textToHtml(text: string): string {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<div>${escaped.replaceAll("\n", "<br>")}</div>`;
}

export function flagsFromSet(flags: Set<string> | undefined): {
  unread: boolean;
  starred: boolean;
} {
  return {
    unread: !flags?.has("\\Seen"),
    starred: flags?.has("\\Flagged") ?? false,
  };
}

function snippetFrom(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 160) return collapsed;
  return `${collapsed.slice(0, 157)}…`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cap(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

function mapAddressList(value: AddressObject | AddressObject[] | undefined): Address[] {
  const groups = value === undefined ? [] : Array.isArray(value) ? value : [value];
  const addresses: Address[] = [];
  for (const group of groups) {
    for (const entry of group.value) {
      const email = entry.address?.trim().toLowerCase() ?? "";
      if (!email) continue;
      addresses.push({ name: entry.name?.trim() ?? "", email });
    }
  }
  return addresses;
}

function headerEmails(parsed: ParsedMail, name: string): string[] {
  const raw = parsed.headers.get(name);
  const lines = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const emails: string[] = [];
  for (const line of lines) {
    if (typeof line !== "string") continue;
    const matches = line.match(emailPattern) ?? [];
    for (const match of matches) emails.push(match.toLowerCase());
  }
  return emails;
}

function referenceIds(parsed: ParsedMail): string[] {
  const raw = parsed.references;
  const values = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const ids: string[] = [];
  for (const value of values) {
    const id = normalizeMessageId(value);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(-20);
}

export async function parseMail(
  source: Buffer,
  flags: Set<string> | undefined,
  internalDate: Date | string | undefined,
): Promise<ParsedMessage> {
  const parsed = await simpleParser(source);
  const flagState = flagsFromSet(flags);
  const fromList = mapAddressList(parsed.from);
  const to = mapAddressList(parsed.to);
  const cc = mapAddressList(parsed.cc);
  const from = fromList[0] ?? { name: "", email: "" };
  const html = typeof parsed.html === "string" ? sanitizeHtml(parsed.html, sanitizeOptions) : null;
  const bodyText = cap(parsed.text?.trim() || (html ? htmlToText(html) : ""), 200_000);
  const dateValue = parsed.date ?? (internalDate instanceof Date ? internalDate : undefined);
  const date = dateValue ? dateValue.getTime() : Date.now();
  const addresses = new Set<string>();
  for (const address of [from, ...to, ...cc]) {
    if (address.email) addresses.add(address.email);
  }
  for (const email of [
    ...headerEmails(parsed, "delivered-to"),
    ...headerEmails(parsed, "x-original-to"),
    ...headerEmails(parsed, "envelope-to"),
  ]) {
    addresses.add(email);
  }

  const attachments: Attachment[] = parsed.attachments.map((attachment, index) => ({
    index,
    filename: attachment.filename ?? "attachment",
    contentType: attachment.contentType || "application/octet-stream",
    size: attachment.size,
  }));

  return {
    messageId: normalizeMessageId(parsed.messageId),
    inReplyTo: normalizeMessageId(
      typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : undefined,
    ),
    references: referenceIds(parsed),
    subject: parsed.subject?.trim() ?? "",
    from,
    to,
    cc,
    date,
    snippet: snippetFrom(bodyText),
    bodyText,
    bodyHtml: html ? cap(html, 500_000) : null,
    unread: flagState.unread,
    starred: flagState.starred,
    attachments,
    addresses: [...addresses],
  };
}

export function messageFromEnvelope(input: {
  subject?: string;
  from?: { name?: string; address?: string }[];
  to?: { name?: string; address?: string }[];
  date?: Date | string;
  flags?: Set<string>;
}): ParsedMessage {
  const map = (list: { name?: string; address?: string }[] | undefined): Address[] => {
    if (!list) return [];
    return list.flatMap((item) => {
      const email = item.address?.trim().toLowerCase() ?? "";
      if (!email) return [];
      return [{ name: item.name?.trim() ?? "", email }];
    });
  };
  const flagState = flagsFromSet(input.flags);
  const from = map(input.from)[0] ?? { name: "", email: "" };
  const to = map(input.to);
  const date =
    input.date instanceof Date
      ? input.date.getTime()
      : typeof input.date === "string"
        ? new Date(input.date).getTime()
        : Date.now();
  const bodyText = "This message is too large to preview here.";
  return {
    messageId: null,
    inReplyTo: null,
    references: [],
    subject: input.subject?.trim() ?? "",
    from,
    to,
    cc: [],
    date: Number.isNaN(date) ? Date.now() : date,
    snippet: bodyText,
    bodyText,
    bodyHtml: null,
    unread: flagState.unread,
    starred: flagState.starred,
    attachments: [],
    addresses: [from, ...to].map((address) => address.email).filter(Boolean),
  };
}
