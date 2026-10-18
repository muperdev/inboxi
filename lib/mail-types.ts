export const mailFolders = [
  "inbox",
  "starred",
  "sent",
  "drafts",
  "archive",
  "junk",
  "trash",
] as const;

export type MailFolder = (typeof mailFolders)[number];

export type FolderRole = Exclude<MailFolder, "starred"> | "custom";

export type ProviderId = "icloud" | "gmail" | "imap";

export type SyncStatus =
  | "disconnected"
  | "connecting"
  | "syncing"
  | "idle"
  | "error";

export type ThreadAction =
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "archive"
  | "trash"
  | "delete";

export type Address = {
  name: string;
  email: string;
};

export type Attachment = {
  index: number;
  filename: string;
  contentType: string;
  size: number;
};

export type Account = {
  id: string;
  email: string;
  displayName: string;
  provider: ProviderId;
  color: string;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncAt: number | null;
  inboxUnread: number;
  starredCount: number;
};

export type Identity = {
  id: string;
  accountId: string;
  email: string;
  displayName: string;
  isPrimary: boolean;
};

export type Folder = {
  id: string;
  accountId: string;
  path: string;
  name: string;
  role: FolderRole;
  unreadCount: number;
  totalCount: number;
};

export type ThreadSummary = {
  id: string;
  accountId: string;
  subject: string;
  snippet: string;
  lastMessageAt: number;
  unread: boolean;
  starred: boolean;
  messageCount: number;
  latestFrom: Address;
  latestTo: Address[];
  accountEmail: string;
  accountColor: string;
  accountName: string;
};

export type MailMessage = {
  id: string;
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
};

export type ThreadDetail = ThreadSummary & {
  messages: MailMessage[];
};

export type AssistantSettings = {
  configured: boolean;
  model: string;
};

export type AssistantAnswer = {
  answer: string;
  threads: ThreadSummary[];
};

export type Bootstrap = {
  accounts: Account[];
  identities: Identity[];
  folders: Folder[];
};

export type AliasInput = {
  email: string;
  displayName: string;
};

export type ConnectAccountInput = {
  provider: ProviderId;
  email: string;
  displayName: string;
  password: string;
  username: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  aliases: AliasInput[];
};

export type SendMessageInput = {
  accountId: string;
  identityId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  replyToMessageId?: string;
};

export type ThreadFilter = {
  folder: MailFolder;
  accountId: string | null;
  alias: string | null;
  limit: number;
};

export function parseMailFolder(value: string | null): MailFolder {
  switch (value) {
    case "starred":
    case "sent":
    case "drafts":
    case "archive":
    case "junk":
    case "trash":
    case "inbox":
      return value;
    default:
      return "inbox";
  }
}

export function isProviderId(value: string): value is ProviderId {
  return value === "icloud" || value === "gmail" || value === "imap";
}

export function isFolderRole(value: string): value is FolderRole {
  switch (value) {
    case "inbox":
    case "sent":
    case "drafts":
    case "trash":
    case "archive":
    case "junk":
    case "custom":
      return true;
    default:
      return false;
  }
}

export function isSyncStatus(value: string): value is SyncStatus {
  switch (value) {
    case "disconnected":
    case "connecting":
    case "syncing":
    case "idle":
    case "error":
      return true;
    default:
      return false;
  }
}

export function isThreadAction(value: string): value is ThreadAction {
  switch (value) {
    case "read":
    case "unread":
    case "star":
    case "unstar":
    case "archive":
    case "trash":
    case "delete":
      return true;
    default:
      return false;
  }
}
