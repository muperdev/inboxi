import type {
  Account,
  AliasInput,
  AssistantAnswer,
  AssistantSettings,
  Bootstrap,
  ConnectAccountInput,
  Identity,
  SendMessageInput,
  ThreadAction,
  ThreadDetail,
  ThreadFilter,
  ThreadSummary,
} from "@/lib/mail-types";

type MailrightDesktop = { apiUrl?: string };

export function mailApiOrigin(): string {
  const desktop = (globalThis as { mailright?: MailrightDesktop }).mailright?.apiUrl;
  if (desktop) return desktop.replace(/\/$/, "");
  const configured = process.env.NEXT_PUBLIC_MAIL_API_URL?.replace(/\/$/, "");
  return configured && configured.length > 0 ? configured : "http://127.0.0.1:8787";
}

export class MailRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${mailApiOrigin()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "The mail server could not complete that.";
    throw new MailRequestError(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function threadQuery(filter: ThreadFilter): string {
  const params = new URLSearchParams({
    folder: filter.folder,
    limit: String(filter.limit),
  });
  if (filter.accountId) params.set("account", filter.accountId);
  if (filter.alias) params.set("alias", filter.alias);
  return `/threads?${params.toString()}`;
}

export const mailApi = {
  bootstrap: () => request<Bootstrap>("/bootstrap"),
  threads: (filter: ThreadFilter) => request<ThreadSummary[]>(threadQuery(filter)),
  thread: (threadId: string) => request<ThreadDetail>(`/threads/${threadId}`),
  search: (query: string) =>
    request<ThreadSummary[]>(`/search?q=${encodeURIComponent(query)}`),
  connect: (input: ConnectAccountInput) =>
    request<Account>("/accounts", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  removeAccount: (accountId: string) =>
    request<void>(`/accounts/${accountId}`, { method: "DELETE" }),
  addAlias: (accountId: string, alias: AliasInput) =>
    request<Identity>(`/accounts/${accountId}/aliases`, {
      method: "POST",
      body: JSON.stringify(alias),
    }),
  removeAlias: (identityId: string) =>
    request<void>(`/identities/${identityId}`, { method: "DELETE" }),
  act: (threadId: string, action: ThreadAction) =>
    request<void>(`/threads/${threadId}/action`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  send: (input: SendMessageInput) =>
    request<{ threadId: string }>("/send", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  settings: () => request<AssistantSettings>("/settings"),
  saveSettings: (input: { apiKey?: string; model?: string }) =>
    request<AssistantSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  rewrite: (input: { instruction: string; text: string; subject: string }) =>
    request<{ text: string }>("/ai/rewrite", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  ask: (prompt: string) =>
    request<AssistantAnswer>("/ai/ask", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
  attachmentUrl: (messageId: string, index: number) =>
    `${mailApiOrigin()}/messages/${messageId}/attachments/${index}`,
};
