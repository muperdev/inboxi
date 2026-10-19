import { Database } from "bun:sqlite";
import { mailDataDir } from "./paths";
import { decryptSecret, encryptSecret } from "./crypto";
import { MailError } from "./errors";
import type { ParsedMessage } from "./parse-mail";
import {
  isFolderRole,
  isProviderId,
  isSyncStatus,
  type Account,
  type Address,
  type AliasInput,
  type Attachment,
  type ConnectAccountInput,
  type Folder,
  type FolderRole,
  type Identity,
  type MailFolder,
  type MailMessage,
  type ProviderId,
  type SyncStatus,
  type ThreadAction,
  type ThreadDetail,
  type ThreadSummary,
} from "../lib/mail-types";
import { defaultAssistantModel, isAssistantModel } from "../lib/assistant-models";

const accountColors = [
  "#6b3fa0",
  "#2b5f99",
  "#8a3fb0",
  "#a8551c",
  "#1f7a4a",
  "#a83a63",
];

const rolePriority: Record<FolderRole, number> = {
  inbox: 60,
  archive: 50,
  sent: 40,
  drafts: 30,
  junk: 20,
  trash: 10,
  custom: 0,
};

const initialWindow: Record<FolderRole, number> = {
  inbox: 250,
  sent: 100,
  drafts: 40,
  archive: 60,
  trash: 30,
  junk: 20,
  custom: 0,
};

export function initialUidWindow(role: FolderRole): number {
  return initialWindow[role];
}

type StoredAccount = {
  id: string;
  email: string;
  displayName: string;
  provider: ProviderId;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
};

export type SyncFolder = {
  id: string;
  path: string;
  role: FolderRole;
  uidValidity: string | null;
  lastUid: number;
};

type ThreadRow = {
  id: string;
  accountId: string;
  subject: string;
  snippet: string;
  lastMessageAt: number;
  unread: number;
  starred: number;
  messageCount: number;
  latestFromJson: string;
  latestToJson: string;
  accountEmail: string;
  accountColor: string;
  accountName: string;
};

const db = new Database(`${mailDataDir()}/mail.db`, { create: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    color TEXT NOT NULL,
    imap_host TEXT NOT NULL,
    imap_port INTEGER NOT NULL,
    smtp_host TEXT NOT NULL,
    smtp_port INTEGER NOT NULL,
    smtp_secure INTEGER NOT NULL,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'disconnected',
    sync_error TEXT,
    last_sync_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS identities (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_primary INTEGER NOT NULL,
    UNIQUE(account_id, email)
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    unread_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    uid_validity TEXT,
    last_uid INTEGER NOT NULL DEFAULT 0,
    UNIQUE(account_id, path)
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    snippet TEXT NOT NULL,
    last_message_at INTEGER NOT NULL,
    unread INTEGER NOT NULL DEFAULT 0,
    starred INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    latest_from_json TEXT NOT NULL,
    latest_to_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS threads_recent ON threads(last_message_at DESC);
  CREATE INDEX IF NOT EXISTS threads_account_recent ON threads(account_id, last_message_at DESC);

  CREATE TABLE IF NOT EXISTS thread_folders (
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    PRIMARY KEY (thread_id, folder_id)
  );

  CREATE INDEX IF NOT EXISTS thread_folders_folder ON thread_folders(folder_id);

  CREATE TABLE IF NOT EXISTS thread_addresses (
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    PRIMARY KEY (thread_id, email)
  );

  CREATE INDEX IF NOT EXISTS thread_addresses_email ON thread_addresses(email);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    imap_uid INTEGER NOT NULL,
    message_id TEXT,
    in_reply_to TEXT,
    references_json TEXT NOT NULL,
    subject TEXT NOT NULL,
    from_json TEXT NOT NULL,
    to_json TEXT NOT NULL,
    cc_json TEXT NOT NULL,
    addresses_json TEXT NOT NULL,
    date INTEGER NOT NULL,
    snippet TEXT NOT NULL,
    body_text TEXT NOT NULL,
    body_html TEXT,
    unread INTEGER NOT NULL,
    starred INTEGER NOT NULL,
    attachments_json TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS messages_folder_uid ON messages(folder_id, imap_uid);
  CREATE UNIQUE INDEX IF NOT EXISTS messages_account_msgid
    ON messages(account_id, message_id) WHERE message_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS messages_thread_date ON messages(thread_id, date);

  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    row_id UNINDEXED,
    subject,
    body_text,
    from_email
  );
`);

function readJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function readAddress(value: unknown): Address | null {
  if (typeof value !== "object" || value === null) return null;
  const name = "name" in value && typeof value.name === "string" ? value.name : "";
  const email = "email" in value && typeof value.email === "string" ? value.email : "";
  if (!email && !name) return null;
  return { name, email };
}

function readAddresses(value: string): Address[] {
  const parsed = readJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    const address = readAddress(item);
    return address ? [address] : [];
  });
}

function readOneAddress(value: string): Address {
  return readAddress(readJson(value)) ?? { name: "", email: "" };
}

function readStringList(value: string): string[] {
  const parsed = readJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === "string");
}

function readAttachments(value: string): Attachment[] {
  const parsed = readJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const index = "index" in item && typeof item.index === "number" ? item.index : -1;
    const filename =
      "filename" in item && typeof item.filename === "string" ? item.filename : "attachment";
    const contentType =
      "contentType" in item && typeof item.contentType === "string"
        ? item.contentType
        : "application/octet-stream";
    const size = "size" in item && typeof item.size === "number" ? item.size : 0;
    if (index < 0) return [];
    return [{ index, filename, contentType, size }];
  });
}

function toThread(row: ThreadRow): ThreadSummary {
  return {
    id: row.id,
    accountId: row.accountId,
    subject: row.subject,
    snippet: row.snippet,
    lastMessageAt: row.lastMessageAt,
    unread: row.unread === 1,
    starred: row.starred === 1,
    messageCount: row.messageCount,
    latestFrom: readOneAddress(row.latestFromJson),
    latestTo: readAddresses(row.latestToJson),
    accountEmail: row.accountEmail,
    accountColor: row.accountColor,
    accountName: row.accountName,
  };
}

const threadSelect = `
  SELECT
    t.id as id,
    t.account_id as accountId,
    t.subject as subject,
    t.snippet as snippet,
    t.last_message_at as lastMessageAt,
    t.unread as unread,
    t.starred as starred,
    t.message_count as messageCount,
    t.latest_from_json as latestFromJson,
    t.latest_to_json as latestToJson,
    a.email as accountEmail,
    a.color as accountColor,
    a.display_name as accountName
  FROM threads t
  JOIN accounts a ON a.id = t.account_id
`;

function requireRole(value: string): FolderRole {
  if (!isFolderRole(value)) throw new MailError("Unknown folder.");
  return value;
}

function requireProvider(value: string): ProviderId {
  if (!isProviderId(value)) throw new MailError("Unknown provider.");
  return value;
}

function requireStatus(value: string): SyncStatus {
  if (!isSyncStatus(value)) return "disconnected";
  return value;
}

function refreshThread(threadId: string): void {
  const messages = db
    .query<{
      folderId: string;
      subject: string;
      snippet: string;
      fromJson: string;
      toJson: string;
      addressesJson: string;
      date: number;
      unread: number;
      starred: number;
    }>(
      `SELECT folder_id as folderId, subject, snippet, from_json as fromJson,
              to_json as toJson, addresses_json as addressesJson, date, unread, starred
       FROM messages WHERE thread_id = ? ORDER BY date DESC`,
    )
    .all(threadId);

  if (messages.length === 0) {
    db.query("DELETE FROM messages_fts WHERE row_id IN (SELECT id FROM messages WHERE thread_id = ?)").run(threadId);
    db.query("DELETE FROM threads WHERE id = ?").run(threadId);
    return;
  }

  const latest = messages[0];
  const earliest = messages[messages.length - 1];
  if (!latest || !earliest) return;

  db.query(
    `UPDATE threads
     SET subject = ?, snippet = ?, last_message_at = ?, unread = ?, starred = ?,
         message_count = ?, latest_from_json = ?, latest_to_json = ?
     WHERE id = ?`,
  ).run(
    earliest.subject,
    latest.snippet,
    latest.date,
    messages.some((message) => message.unread === 1) ? 1 : 0,
    messages.some((message) => message.starred === 1) ? 1 : 0,
    messages.length,
    latest.fromJson,
    latest.toJson,
    threadId,
  );

  db.query("DELETE FROM thread_folders WHERE thread_id = ?").run(threadId);
  const insertFolder = db.query(
    "INSERT OR IGNORE INTO thread_folders (thread_id, folder_id) VALUES (?, ?)",
  );
  for (const folderId of new Set(messages.map((message) => message.folderId))) {
    insertFolder.run(threadId, folderId);
  }

  db.query("DELETE FROM thread_addresses WHERE thread_id = ?").run(threadId);
  const insertAddress = db.query(
    "INSERT OR IGNORE INTO thread_addresses (thread_id, email) VALUES (?, ?)",
  );
  const emails = new Set<string>();
  for (const message of messages) {
    for (const email of readStringList(message.addressesJson)) emails.add(email);
  }
  for (const email of emails) insertAddress.run(threadId, email);
}

function writeFts(messageId: string, subject: string, bodyText: string, fromEmail: string): void {
  db.query("DELETE FROM messages_fts WHERE row_id = ?").run(messageId);
  db.query(
    "INSERT INTO messages_fts (row_id, subject, body_text, from_email) VALUES (?, ?, ?, ?)",
  ).run(messageId, subject, bodyText, fromEmail);
}

function deleteMessageRow(messageId: string, threadId: string): void {
  db.query("DELETE FROM messages_fts WHERE row_id = ?").run(messageId);
  db.query("DELETE FROM messages WHERE id = ?").run(messageId);
  refreshThread(threadId);
}

function folderPriority(folderId: string): number {
  const row = db
    .query<{ role: string }>("SELECT role FROM folders WHERE id = ?")
    .get(folderId);
  if (!row || !isFolderRole(row.role)) return 0;
  return rolePriority[row.role];
}

function findThreadId(
  accountId: string,
  messageId: string | null,
  inReplyTo: string | null,
  references: string[],
): string | null {
  const ids = [messageId, inReplyTo, ...references].filter(
    (id): id is string => Boolean(id),
  );
  if (ids.length === 0) return null;
  const unique = [...new Set(ids)];
  const placeholders = unique.map(() => "?").join(", ");
  const row = db
    .query<{ threadId: string }>(
      `SELECT thread_id as threadId FROM messages
       WHERE account_id = ? AND message_id IN (${placeholders}) LIMIT 1`,
    )
    .get(accountId, ...unique);
  return row?.threadId ?? null;
}

function insertMessage(
  accountId: string,
  folderId: string,
  imapUid: number,
  threadId: string,
  parsed: ParsedMessage,
): void {
  const id = crypto.randomUUID();
  db.query(
    `INSERT INTO messages (
      id, account_id, thread_id, folder_id, imap_uid, message_id, in_reply_to,
      references_json, subject, from_json, to_json, cc_json, addresses_json, date,
      snippet, body_text, body_html, unread, starred, attachments_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    accountId,
    threadId,
    folderId,
    imapUid,
    parsed.messageId,
    parsed.inReplyTo,
    JSON.stringify(parsed.references),
    parsed.subject,
    JSON.stringify(parsed.from),
    JSON.stringify(parsed.to),
    JSON.stringify(parsed.cc),
    JSON.stringify(parsed.addresses),
    parsed.date,
    parsed.snippet,
    parsed.bodyText,
    parsed.bodyHtml,
    parsed.unread ? 1 : 0,
    parsed.starred ? 1 : 0,
    JSON.stringify(parsed.attachments),
  );
  writeFts(id, parsed.subject, parsed.bodyText, parsed.from.email);
}

const upsertTransaction = db.transaction(
  (accountId: string, folderId: string, imapUid: number, parsed: ParsedMessage) => {
    const existing = parsed.messageId
      ? db
          .query<{ id: string; threadId: string; folderId: string }>(
            `SELECT id, thread_id as threadId, folder_id as folderId
             FROM messages WHERE account_id = ? AND message_id = ?`,
          )
          .get(accountId, parsed.messageId)
      : null;

    if (existing) {
      const preferIncoming =
        existing.folderId === folderId ||
        folderPriority(folderId) >= folderPriority(existing.folderId);
      if (preferIncoming) {
        const collision = db
          .query<{ id: string }>(
            "SELECT id FROM messages WHERE folder_id = ? AND imap_uid = ? AND id != ?",
          )
          .get(folderId, imapUid, existing.id);
        const nextUid = collision ? -Math.floor(Math.random() * 1_000_000_000) - 1 : imapUid;
        db.query(
          `UPDATE messages
           SET folder_id = ?, imap_uid = ?, unread = ?, starred = ?
           WHERE id = ?`,
        ).run(folderId, nextUid, parsed.unread ? 1 : 0, parsed.starred ? 1 : 0, existing.id);
      }
      refreshThread(existing.threadId);
      return;
    }

    const threadId =
      findThreadId(accountId, parsed.messageId, parsed.inReplyTo, parsed.references) ??
      crypto.randomUUID();
    const threadExists = db
      .query<{ id: string }>("SELECT id FROM threads WHERE id = ?")
      .get(threadId);
    if (!threadExists) {
      db.query(
        `INSERT INTO threads (
          id, account_id, subject, snippet, last_message_at, unread, starred,
          message_count, latest_from_json, latest_to_json
        ) VALUES (?, ?, '', '', 0, 0, 0, 0, '{}', '[]')`,
      ).run(threadId, accountId);
    }
    insertMessage(accountId, folderId, imapUid, threadId, parsed);
    refreshThread(threadId);
  },
);

function accountFilter(accountId: string | null, alias: string | null): {
  sql: string;
  params: Array<string | number | null>;
} {
  const params: Array<string | number | null> = [];
  let sql = "";
  if (accountId) {
    sql += " AND t.account_id = ?";
    params.push(accountId);
  }
  if (alias) {
    sql +=
      " AND EXISTS (SELECT 1 FROM thread_addresses ta WHERE ta.thread_id = t.id AND ta.email = ?)";
    params.push(alias);
  }
  return { sql, params };
}

function readSetting(key: string): string | null {
  const row = db.query<{ value: string }>("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row?.value ?? null;
}

function writeSetting(key: string, value: string | null): void {
  if (value === null) {
    db.query("DELETE FROM app_settings WHERE key = ?").run(key);
    return;
  }
  db.query(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

const syncProgress = new Map<string, { done: number; total: number }>();

export const mailDb = {
  listAccounts(): Account[] {
    const rows = db
      .query<{
        id: string;
        email: string;
        displayName: string;
        provider: string;
        color: string;
        syncStatus: string;
        syncError: string | null;
        lastSyncAt: number | null;
        inboxUnread: number;
        starredCount: number;
      }>(
        `SELECT
          a.id as id,
          a.email as email,
          a.display_name as displayName,
          a.provider as provider,
          a.color as color,
          a.sync_status as syncStatus,
          a.sync_error as syncError,
          a.last_sync_at as lastSyncAt,
          COALESCE((
            SELECT SUM(unread_count) FROM folders f
            WHERE f.account_id = a.id AND f.role = 'inbox'
          ), 0) as inboxUnread,
          (
            SELECT COUNT(*) FROM threads t
            WHERE t.account_id = a.id AND t.starred = 1
            AND NOT EXISTS (
              SELECT 1 FROM thread_folders tf
              JOIN folders f ON f.id = tf.folder_id
              WHERE tf.thread_id = t.id AND f.role = 'trash'
            )
          ) as starredCount
        FROM accounts a
        ORDER BY a.created_at ASC`,
      )
      .all();

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      provider: requireProvider(row.provider),
      color: row.color,
      syncStatus: requireStatus(row.syncStatus),
      syncError: row.syncError,
      syncDone: syncProgress.get(row.id)?.done ?? 0,
      syncTotal: syncProgress.get(row.id)?.total ?? 0,
      lastSyncAt: row.lastSyncAt,
      inboxUnread: row.inboxUnread,
      starredCount: row.starredCount,
    }));
  },

  listIdentities(): Identity[] {
    return db
      .query<{
        id: string;
        accountId: string;
        email: string;
        displayName: string;
        isPrimary: number;
      }>(
        `SELECT id, account_id as accountId, email, display_name as displayName, is_primary as isPrimary
         FROM identities ORDER BY is_primary DESC, email ASC`,
      )
      .all()
      .map((row) => ({
        id: row.id,
        accountId: row.accountId,
        email: row.email,
        displayName: row.displayName,
        isPrimary: row.isPrimary === 1,
      }));
  },

  listFolders(): Folder[] {
    return db
      .query<{
        id: string;
        accountId: string;
        path: string;
        name: string;
        role: string;
        unreadCount: number;
        totalCount: number;
      }>(
        `SELECT id, account_id as accountId, path, name, role,
                unread_count as unreadCount, total_count as totalCount
         FROM folders ORDER BY name ASC`,
      )
      .all()
      .map((row) => ({
        id: row.id,
        accountId: row.accountId,
        path: row.path,
        name: row.name,
        role: requireRole(row.role),
        unreadCount: row.unreadCount,
        totalCount: row.totalCount,
      }));
  },

  listAccountIds(): string[] {
    return db
      .query<{ id: string }>("SELECT id FROM accounts ORDER BY created_at ASC")
      .all()
      .map((row) => row.id);
  },

  getSecret(accountId: string): StoredAccount | null {
    const row = db
      .query<{
        id: string;
        email: string;
        displayName: string;
        provider: string;
        imapHost: string;
        imapPort: number;
        smtpHost: string;
        smtpPort: number;
        smtpSecure: number;
        username: string;
        passwordEncrypted: string;
      }>(
        `SELECT id, email, display_name as displayName, provider, imap_host as imapHost,
                imap_port as imapPort, smtp_host as smtpHost, smtp_port as smtpPort,
                smtp_secure as smtpSecure, username, password_encrypted as passwordEncrypted
         FROM accounts WHERE id = ?`,
      )
      .get(accountId);
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      provider: requireProvider(row.provider),
      imapHost: row.imapHost,
      imapPort: row.imapPort,
      smtpHost: row.smtpHost,
      smtpPort: row.smtpPort,
      smtpSecure: row.smtpSecure === 1,
      username: row.username,
      password: decryptSecret(row.passwordEncrypted),
    };
  },

  emailExists(email: string): boolean {
    return (
      db.query<{ id: string }>("SELECT id FROM accounts WHERE email = ?").get(email) !==
      null
    );
  },

  insertAccount(input: ConnectAccountInput): Account {
    const id = crypto.randomUUID();
    const count =
      db.query<{ count: number }>("SELECT COUNT(*) as count FROM accounts").get()?.count ??
      0;
    const color = accountColors[count % accountColors.length] ?? "#6b3fa0";
    const now = Date.now();
    const write = db.transaction(() => {
      db.query(
        `INSERT INTO accounts (
          id, email, display_name, provider, color, imap_host, imap_port, smtp_host,
          smtp_port, smtp_secure, username, password_encrypted, sync_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', ?)`,
      ).run(
        id,
        input.email,
        input.displayName,
        input.provider,
        color,
        input.imapHost,
        input.imapPort,
        input.smtpHost,
        input.smtpPort,
        input.smtpSecure ? 1 : 0,
        input.username,
        encryptSecret(input.password),
        now,
      );
      db.query(
        `INSERT INTO identities (id, account_id, email, display_name, is_primary)
         VALUES (?, ?, ?, ?, 1)`,
      ).run(crypto.randomUUID(), id, input.email, input.displayName);
      for (const alias of input.aliases) {
        db.query(
          `INSERT OR IGNORE INTO identities (id, account_id, email, display_name, is_primary)
           VALUES (?, ?, ?, ?, 0)`,
        ).run(crypto.randomUUID(), id, alias.email, alias.displayName);
      }
    });
    write();
    const account = this.listAccounts().find((item) => item.id === id);
    if (!account) throw new MailError("Could not save that account.");
    return account;
  },

  deleteAccount(accountId: string): void {
    db.query(
      "DELETE FROM messages_fts WHERE row_id IN (SELECT id FROM messages WHERE account_id = ?)",
    ).run(accountId);
    db.query("DELETE FROM accounts WHERE id = ?").run(accountId);
  },

  addAlias(accountId: string, alias: AliasInput): Identity {
    const account = db
      .query<{ id: string }>("SELECT id FROM accounts WHERE id = ?")
      .get(accountId);
    if (!account) throw new MailError("That account is not connected.");
    const id = crypto.randomUUID();
    db.query(
      `INSERT INTO identities (id, account_id, email, display_name, is_primary)
       VALUES (?, ?, ?, ?, 0)`,
    ).run(id, accountId, alias.email, alias.displayName);
    return {
      id,
      accountId,
      email: alias.email,
      displayName: alias.displayName,
      isPrimary: false,
    };
  },

  deleteIdentity(identityId: string): void {
    const row = db
      .query<{ isPrimary: number }>("SELECT is_primary as isPrimary FROM identities WHERE id = ?")
      .get(identityId);
    if (!row) return;
    if (row.isPrimary === 1) throw new MailError("The primary address stays with the account.");
    db.query("DELETE FROM identities WHERE id = ?").run(identityId);
  },

  setSyncProgress(accountId: string, done: number, total: number): void {
    syncProgress.set(accountId, { done, total });
  },

  setSync(accountId: string, status: SyncStatus, error: string | null): void {
    if (status === "idle" || status === "error") syncProgress.delete(accountId);
    db.query(
      `UPDATE accounts
       SET sync_status = ?, sync_error = ?, last_sync_at = CASE WHEN ? = 'idle' THEN ? ELSE last_sync_at END
       WHERE id = ?`,
    ).run(status, error, status, Date.now(), accountId);
  },

  upsertFolder(accountId: string, path: string, name: string, role: FolderRole): string {
    const existing = db
      .query<{ id: string }>("SELECT id FROM folders WHERE account_id = ? AND path = ?")
      .get(accountId, path);
    if (existing) {
      db.query("UPDATE folders SET name = ?, role = ? WHERE id = ?").run(name, role, existing.id);
      return existing.id;
    }
    const id = crypto.randomUUID();
    db.query(
      `INSERT INTO folders (id, account_id, path, name, role, unread_count, total_count, last_uid)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0)`,
    ).run(id, accountId, path, name, role);
    return id;
  },

  syncFolders(accountId: string): SyncFolder[] {
    return db
      .query<{
        id: string;
        path: string;
        role: string;
        uidValidity: string | null;
        lastUid: number;
      }>(
        `SELECT id, path, role, uid_validity as uidValidity, last_uid as lastUid
         FROM folders WHERE account_id = ? AND role != 'custom'`,
      )
      .all(accountId)
      .flatMap((row) => {
        if (!isFolderRole(row.role) || row.role === "custom") return [];
        return [
          {
            id: row.id,
            path: row.path,
            role: row.role,
            uidValidity: row.uidValidity,
            lastUid: row.lastUid,
          },
        ];
      });
  },

  folderByRole(accountId: string, role: FolderRole): { id: string; path: string } | null {
    return db
      .query<{ id: string; path: string }>(
        "SELECT id, path FROM folders WHERE account_id = ? AND role = ? LIMIT 1",
      )
      .get(accountId, role);
  },

  noteValidity(folderId: string, uidValidity: string): boolean {
    const current = db
      .query<{ uidValidity: string | null }>(
        "SELECT uid_validity as uidValidity FROM folders WHERE id = ?",
      )
      .get(folderId);
    if (!current || current.uidValidity === uidValidity) return false;
    if (current.uidValidity === null) {
      db.query("UPDATE folders SET uid_validity = ? WHERE id = ?").run(uidValidity, folderId);
      return false;
    }
    const messages = db
      .query<{ id: string; threadId: string }>(
        "SELECT id, thread_id as threadId FROM messages WHERE folder_id = ?",
      )
      .all(folderId);
    for (const message of messages) deleteMessageRow(message.id, message.threadId);
    db.query("UPDATE folders SET uid_validity = ?, last_uid = 0 WHERE id = ?").run(
      uidValidity,
      folderId,
    );
    return true;
  },

  upsertMessage(
    accountId: string,
    folderId: string,
    imapUid: number,
    parsed: ParsedMessage,
  ): void {
    upsertTransaction(accountId, folderId, imapUid, parsed);
  },

  updateFlags(folderId: string, imapUid: number, unread: boolean, starred: boolean): void {
    const row = db
      .query<{ threadId: string }>(
        "SELECT thread_id as threadId FROM messages WHERE folder_id = ? AND imap_uid = ?",
      )
      .get(folderId, imapUid);
    if (!row) return;
    db.query("UPDATE messages SET unread = ?, starred = ? WHERE folder_id = ? AND imap_uid = ?").run(
      unread ? 1 : 0,
      starred ? 1 : 0,
      folderId,
      imapUid,
    );
    refreshThread(row.threadId);
  },

  uidsInFolder(folderId: string): number[] {
    return db
      .query<{ imapUid: number }>(
        "SELECT imap_uid as imapUid FROM messages WHERE folder_id = ? AND imap_uid > 0",
      )
      .all(folderId)
      .map((row) => row.imapUid);
  },

  deleteByUid(folderId: string, imapUid: number): void {
    const row = db
      .query<{ id: string; threadId: string }>(
        "SELECT id, thread_id as threadId FROM messages WHERE folder_id = ? AND imap_uid = ?",
      )
      .get(folderId, imapUid);
    if (!row) return;
    deleteMessageRow(row.id, row.threadId);
  },

  recount(accountId: string): void {
    db.query(
      `UPDATE folders SET
        unread_count = (SELECT COUNT(*) FROM messages WHERE folder_id = folders.id AND unread = 1),
        total_count = (SELECT COUNT(*) FROM messages WHERE folder_id = folders.id),
        last_uid = COALESCE((
          SELECT MAX(imap_uid) FROM messages WHERE folder_id = folders.id AND imap_uid > 0
        ), 0)
       WHERE account_id = ?`,
    ).run(accountId);
  },

  listThreads(
    folder: MailFolder,
    accountId: string | null,
    alias: string | null,
    limit: number,
  ): ThreadSummary[] {
    const filter = accountFilter(accountId, alias);
    if (folder === "starred") {
      return db
        .query<ThreadRow>(
          `${threadSelect}
           WHERE t.starred = 1
           AND NOT EXISTS (
             SELECT 1 FROM thread_folders tf
             JOIN folders f ON f.id = tf.folder_id
             WHERE tf.thread_id = t.id AND f.role = 'trash'
           )
           ${filter.sql}
           ORDER BY t.last_message_at DESC
           LIMIT ?`,
        )
        .all(...filter.params, limit)
        .map(toThread);
    }

    return db
      .query<ThreadRow>(
        `${threadSelect}
         WHERE EXISTS (
           SELECT 1 FROM thread_folders tf
           JOIN folders f ON f.id = tf.folder_id
           WHERE tf.thread_id = t.id AND f.role = ?
         )
         ${filter.sql}
         ORDER BY t.last_message_at DESC
         LIMIT ?`,
      )
      .all(folder, ...filter.params, limit)
      .map(toThread);
  },

  searchThreads(match: string, limit: number): ThreadSummary[] {
    const ids = db
      .query<{ id: string }>(
        `SELECT t.id as id, MAX(t.last_message_at) as recent
         FROM messages_fts
         JOIN messages m ON m.id = messages_fts.row_id
         JOIN threads t ON t.id = m.thread_id
         WHERE messages_fts MATCH ?
         GROUP BY t.id
         ORDER BY recent DESC
         LIMIT ?`,
      )
      .all(match, limit);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(", ");
    const rows = db
      .query<ThreadRow>(`${threadSelect} WHERE t.id IN (${placeholders})`)
      .all(...ids.map((row) => row.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((row) => {
      const thread = byId.get(row.id);
      return thread ? [toThread(thread)] : [];
    });
  },

  getThread(threadId: string): ThreadDetail | null {
    const row = db.query<ThreadRow>(`${threadSelect} WHERE t.id = ?`).get(threadId);
    if (!row) return null;
    const messages = db
      .query<{
        id: string;
        subject: string;
        fromJson: string;
        toJson: string;
        ccJson: string;
        date: number;
        snippet: string;
        bodyText: string;
        bodyHtml: string | null;
        unread: number;
        starred: number;
        attachmentsJson: string;
      }>(
        `SELECT id, subject, from_json as fromJson, to_json as toJson, cc_json as ccJson,
                date, snippet, body_text as bodyText, body_html as bodyHtml, unread, starred,
                attachments_json as attachmentsJson
         FROM messages WHERE thread_id = ? ORDER BY date ASC`,
      )
      .all(threadId)
      .map((message) => ({
        id: message.id,
        subject: message.subject,
        from: readOneAddress(message.fromJson),
        to: readAddresses(message.toJson),
        cc: readAddresses(message.ccJson),
        date: message.date,
        snippet: message.snippet,
        bodyText: message.bodyText,
        bodyHtml: message.bodyHtml,
        unread: message.unread === 1,
        starred: message.starred === 1,
        attachments: readAttachments(message.attachmentsJson),
      }));
    return { ...toThread(row), messages };
  },

  threadMessages(threadId: string): Array<{
    id: string;
    imapUid: number;
    folderId: string;
    folderPath: string;
    folderRole: FolderRole;
  }> {
    return db
      .query<{
        id: string;
        imapUid: number;
        folderId: string;
        folderPath: string;
        folderRole: string;
      }>(
        `SELECT m.id as id, m.imap_uid as imapUid, m.folder_id as folderId,
                f.path as folderPath, f.role as folderRole
         FROM messages m
         JOIN folders f ON f.id = m.folder_id
         WHERE m.thread_id = ?`,
      )
      .all(threadId)
      .flatMap((row) => {
        if (!isFolderRole(row.folderRole)) return [];
        return [
          {
            id: row.id,
            imapUid: row.imapUid,
            folderId: row.folderId,
            folderPath: row.folderPath,
            folderRole: row.folderRole,
          },
        ];
      });
  },

  threadAccountId(threadId: string): string | null {
    return (
      db
        .query<{ accountId: string }>("SELECT account_id as accountId FROM threads WHERE id = ?")
        .get(threadId)?.accountId ?? null
    );
  },

  applyFlags(threadId: string, action: Extract<ThreadAction, "read" | "unread" | "star" | "unstar">): void {
    if (action === "read" || action === "unread") {
      db.query("UPDATE messages SET unread = ? WHERE thread_id = ?").run(
        action === "unread" ? 1 : 0,
        threadId,
      );
    } else {
      db.query("UPDATE messages SET starred = ? WHERE thread_id = ?").run(
        action === "star" ? 1 : 0,
        threadId,
      );
    }
    refreshThread(threadId);
  },

  relocateMessage(messageId: string, folderId: string, imapUid: number): void {
    const row = db
      .query<{ threadId: string }>("SELECT thread_id as threadId FROM messages WHERE id = ?")
      .get(messageId);
    if (!row) return;
    try {
      db.query("UPDATE messages SET folder_id = ?, imap_uid = ? WHERE id = ?").run(
        folderId,
        imapUid,
        messageId,
      );
    } catch {
      db.query("UPDATE messages SET folder_id = ?, imap_uid = ? WHERE id = ?").run(
        folderId,
        -Date.now(),
        messageId,
      );
    }
    refreshThread(row.threadId);
  },

  deleteThread(threadId: string): void {
    const messages = db
      .query<{ id: string }>("SELECT id FROM messages WHERE thread_id = ?")
      .all(threadId);
    for (const message of messages) {
      db.query("DELETE FROM messages_fts WHERE row_id = ?").run(message.id);
    }
    db.query("DELETE FROM threads WHERE id = ?").run(threadId);
  },

  replySource(messageId: string): {
    accountId: string;
    messageId: string | null;
    references: string[];
    subject: string;
    threadId: string;
  } | null {
    const row = db
      .query<{
        accountId: string;
        messageId: string | null;
        referencesJson: string;
        subject: string;
        threadId: string;
      }>(
        `SELECT account_id as accountId, message_id as messageId, references_json as referencesJson,
                subject, thread_id as threadId
         FROM messages WHERE id = ?`,
      )
      .get(messageId);
    if (!row) return null;
    return {
      accountId: row.accountId,
      messageId: row.messageId,
      references: readStringList(row.referencesJson),
      subject: row.subject,
      threadId: row.threadId,
    };
  },

  identityFor(accountId: string, identityId: string): { email: string; displayName: string } | null {
    return db
      .query<{ email: string; displayName: string }>(
        "SELECT email, display_name as displayName FROM identities WHERE id = ? AND account_id = ?",
      )
      .get(identityId, accountId);
  },

  insertOutgoing(input: {
    accountId: string;
    from: Address;
    to: Address[];
    cc: Address[];
    subject: string;
    text: string;
    html: string;
    messageId: string;
    inReplyTo: string | null;
    references: string[];
    threadId: string | null;
  }): string {
    const sent = this.folderByRole(input.accountId, "sent");
    if (!sent) throw new MailError("Sent mail isn't available yet. Give the first sync a moment.");
    const threadId = input.threadId ?? crypto.randomUUID();
    const addresses = [input.from, ...input.to, ...input.cc]
      .map((address) => address.email)
      .filter(Boolean);
    const parsed: ParsedMessage = {
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
      subject: input.subject,
      from: input.from,
      to: input.to,
      cc: input.cc,
      date: Date.now(),
      snippet: input.text.replace(/\s+/g, " ").trim().slice(0, 160),
      bodyText: input.text,
      bodyHtml: input.html,
      unread: false,
      starred: false,
      attachments: [],
      addresses,
    };
    const write = db.transaction(() => {
      const exists = db.query<{ id: string }>("SELECT id FROM threads WHERE id = ?").get(threadId);
      if (!exists) {
        db.query(
          `INSERT INTO threads (
            id, account_id, subject, snippet, last_message_at, unread, starred,
            message_count, latest_from_json, latest_to_json
          ) VALUES (?, ?, '', '', 0, 0, 0, 0, '{}', '[]')`,
        ).run(threadId, input.accountId);
      }
      insertMessage(input.accountId, sent.id, -Math.floor(Math.random() * 1_000_000_000) - 1, threadId, parsed);
      refreshThread(threadId);
    });
    write();
    return threadId;
  },

  attachmentSource(messageId: string, index: number): {
    accountId: string;
    folderPath: string;
    imapUid: number;
    messageId: string | null;
    filename: string;
    contentType: string;
  } | null {
    const row = db
      .query<{
        accountId: string;
        folderPath: string;
        imapUid: number;
        messageId: string | null;
        attachmentsJson: string;
      }>(
        `SELECT m.account_id as accountId, f.path as folderPath, m.imap_uid as imapUid,
                m.message_id as messageId, m.attachments_json as attachmentsJson
         FROM messages m JOIN folders f ON f.id = m.folder_id
         WHERE m.id = ?`,
      )
      .get(messageId);
    if (!row) return null;
    const attachment = readAttachments(row.attachmentsJson).find((item) => item.index === index);
    if (!attachment) return null;
    return {
      accountId: row.accountId,
      folderPath: row.folderPath,
      imapUid: row.imapUid,
      messageId: row.messageId,
      filename: attachment.filename,
      contentType: attachment.contentType,
    };
  },

  assistantSettings(): { configured: boolean; model: string } {
    const model = readSetting("openrouter_model");
    return {
      configured: readSetting("openrouter_key") !== null,
      model: model && isAssistantModel(model) ? model : defaultAssistantModel,
    };
  },

  saveAssistantSettings(input: { apiKey?: string; model?: string }): void {
    if (input.apiKey !== undefined) {
      if (input.apiKey.length === 0) writeSetting("openrouter_key", null);
      else writeSetting("openrouter_key", encryptSecret(input.apiKey));
    }
    if (input.model && isAssistantModel(input.model)) {
      writeSetting("openrouter_model", input.model);
    }
  },

  assistantKey(): string | null {
    const stored = readSetting("openrouter_key");
    if (!stored) return null;
    try {
      const key = decryptSecret(stored);
      return key.length > 0 ? key : null;
    } catch {
      return null;
    }
  },
};
