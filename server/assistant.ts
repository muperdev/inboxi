import { defaultAssistantModel } from "../lib/assistant-models";
import type { ThreadSummary } from "../lib/mail-types";
import { mailDb } from "./db";
import { MailError } from "./errors";
import { ftsQuery } from "./validate";

type ChatMessage = { role: "system" | "user"; content: string };

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

function hideKey(message: string, key: string): string {
  return message.split(key).join("…").slice(0, 220);
}

async function complete(key: string, model: string, messages: ChatMessage[]): Promise<string> {
  let response: Response;
  try {
    response = await fetch(openRouterUrl, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, messages }),
    });
  } catch {
    throw new MailError("OpenRouter did not respond. Check the connection and try again.");
  }

  const body: unknown = await response.json().catch(() => null);
  const record =
    body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const errorRecord =
    record && typeof record.error === "object" && record.error !== null
      ? (record.error as Record<string, unknown>)
      : null;
  const errorMessage = typeof errorRecord?.message === "string" ? errorRecord.message : null;
  if (!response.ok) {
    throw new MailError(
      hideKey(errorMessage ?? "OpenRouter rejected that request.", key),
    );
  }

  const choices = Array.isArray(record?.choices) ? record.choices : [];
  const first = choices[0];
  const message =
    first && typeof first === "object" ? (first as Record<string, unknown>).message : null;
  const content =
    message && typeof message === "object"
      ? (message as Record<string, unknown>).content
      : null;
  const text = readModelText(content);
  if (!text) throw new MailError("OpenRouter returned an empty reply.");
  return text;
}

function readModelText(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Array.isArray(content)) return null;
  const text = content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const value = (part as Record<string, unknown>).text;
      return typeof value === "string" ? value : "";
    })
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}

function credentials(): { key: string; model: string } {
  const key = mailDb.assistantKey();
  if (!key) throw new MailError("Add an OpenRouter key in Settings.");
  const settings = mailDb.assistantSettings();
  return { key, model: settings.model || defaultAssistantModel };
}

export async function rewriteDraft(input: {
  instruction: string;
  text: string;
  subject: string;
  context?: string;
}): Promise<string> {
  const { key, model } = credentials();
  const draft = clip(input.text, 12_000);
  const context = clip(input.context ?? "", 6_000);
  const instruction = clip(input.instruction, 500);
  if (!instruction) throw new MailError("Say what the message should say.");

  const system = draft
    ? "You rewrite email for the person who is writing it. Return only the new message body. No subject line, no quotation marks, no commentary."
    : "You write email for the person composing it. Return only the message body. No subject line, no quotation marks, no commentary.";
  const user = draft
    ? `Subject: ${clip(input.subject, 200) || "(none)"}\n\nInstruction: ${instruction}\n\nDraft:\n${draft}`
    : `Subject: ${clip(input.subject, 200) || "(none)"}\n\nMessage they are replying to:\n${context || "(none)"}\n\nWhat they want to say:\n${instruction}`;

  return complete(key, model, [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
}

export async function askMail(prompt: string): Promise<{
  answer: string;
  threads: ThreadSummary[];
}> {
  const { key, model } = credentials();
  const question = clip(prompt, 1_000);
  if (question.length < 2) throw new MailError("Ask something about your mail.");

  const match = ftsQuery(question);
  const threads = match ? mailDb.searchThreads(match, 8) : [];
  const excerpts = threads.slice(0, 4).map((thread) => {
    const detail = mailDb.getThread(thread.id);
    const latest = detail?.messages[detail.messages.length - 1];
    const body = clip(latest?.bodyText ?? thread.snippet, 900);
    return [
      `id: ${thread.id}`,
      `from: ${thread.latestFrom.name || thread.latestFrom.email}`,
      `subject: ${thread.subject}`,
      `snippet: ${body}`,
    ].join("\n");
  });

  const context =
    excerpts.length > 0
      ? excerpts.join("\n\n")
      : "No matching messages were found in the local mailbox.";

  const answer = await complete(key, model, [
    {
      role: "system",
      content:
        "You are Inboxi, a private assistant for one person's mailbox. Answer only from the messages provided. If they do not contain the answer, say so in one sentence. Do not invent senders, dates, or quotes. Keep the reply under 120 words.",
    },
    {
      role: "user",
      content: `Question: ${question}\n\nMessages:\n${context}`,
    },
  ]);

  return { answer, threads };
}
