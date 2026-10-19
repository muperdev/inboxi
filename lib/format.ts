import type { Address, MailFolder, ThreadSummary } from "@/lib/mail-types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return emailPattern.test(value.trim());
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const mailboxDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "fastmail.com",
  "hey.com",
  "mail.com",
  "zoho.com",
  "gmx.com",
  "gmx.net",
]);

const multiPartSuffixes = new Set(["co.uk", "com.au", "co.jp", "com.br", "co.nz", "com.mx", "co.za", "com.tr"]);

export function companyDomain(email: string): string | null {
  const domain = email.trim().toLowerCase().split("@")[1]?.replace(/\.+$/, "");
  if (!domain || !domain.includes(".")) return null;
  const labels = domain.split(".");
  const tail = labels.slice(-2).join(".");
  const root = labels.length > 2 && multiPartSuffixes.has(tail) ? labels.slice(-3).join(".") : tail;
  if (mailboxDomains.has(domain) || mailboxDomains.has(root)) return null;
  return root;
}

export function initials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).slice(0, 2);
  const first = parts[0] ?? "?";
  const second = parts[1];
  if (!second) return first.slice(0, 1).toUpperCase();
  return `${first.slice(0, 1)}${second.slice(0, 1)}`.toUpperCase();
}

export function threadSender(
  thread: ThreadSummary,
  ownEmails: ReadonlySet<string>,
): string {
  const from = thread.latestFrom;
  if (from.email && !ownEmails.has(from.email)) {
    return from.name || from.email;
  }
  const recipient =
    thread.latestTo.find((address) => !ownEmails.has(address.email)) ??
    thread.latestTo[0];
  if (!recipient) return "Me";
  return `To: ${recipient.name || recipient.email}`;
}

export function displaySubject(subject: string): string {
  const trimmed = subject.trim();
  return trimmed.length > 0 ? trimmed : "(No subject)";
}

export function formatThreadTime(timestamp: number, now = new Date()): string {
  const date = new Date(timestamp);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const start = startOfToday.getTime();

  if (timestamp >= start) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (timestamp >= start - 86_400_000) return "Yesterday";
  if (timestamp >= start - 6 * 86_400_000) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const folderLabels: Record<MailFolder, string> = {
  inbox: "Inbox",
  starred: "Starred",
  sent: "Sent",
  drafts: "Drafts",
  archive: "Archive",
  junk: "Junk",
  trash: "Trash",
};

export function folderLabel(folder: MailFolder): string {
  return folderLabels[folder];
}

export function emptyFolderCopy(folder: MailFolder): string {
  switch (folder) {
    case "inbox":
      return "You're caught up.";
    case "starred":
      return "Star a conversation to keep it here.";
    case "sent":
      return "Messages you send will show up here.";
    case "drafts":
      return "No drafts.";
    case "archive":
      return "Archive is empty.";
    case "junk":
      return "Nothing in junk.";
    case "trash":
      return "Trash is empty.";
  }
}

export function recipientLine(label: string, addresses: Address[]): string | null {
  if (addresses.length === 0) return null;
  const names = addresses.map((address) => address.name || address.email);
  return `${label}: ${names.join(", ")}`;
}
