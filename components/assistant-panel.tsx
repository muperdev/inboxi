"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { displaySubject, formatThreadTime, threadSender } from "@/lib/format";
import { mailApi } from "@/lib/mail-api";
import type { AssistantAnswer, ThreadSummary } from "@/lib/mail-types";

export function AssistantPanel({
  ownEmails,
  configured,
  onOpenSettings,
  onOpenThread,
}: {
  ownEmails: ReadonlySet<string>;
  configured: boolean;
  onOpenSettings: () => void;
  onOpenThread: (threadId: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="px-8 pt-8 pb-4">
        <h1 className="font-display text-[32px] leading-[1.05] font-normal tracking-[-0.03em]">
          Ask your mail.
          <em className="mt-1 block font-light italic">It stays on this Mac.</em>
        </h1>
      </header>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-8 pb-8">
        {configured ? null : (
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            Add your own OpenRouter key in Settings. Nothing is shared with the project.
          </p>
        )}
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const next = prompt.trim();
            if (next.length < 2) return;
            setPending(true);
            void mailApi
              .ask(next)
              .then(setAnswer)
              .catch((error: unknown) => {
                toast.error(error instanceof Error ? error.message : "The assistant could not answer.");
              })
              .finally(() => setPending(false));
          }}
        >
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What did Alex say about the lease?"
            className="min-h-24"
            aria-label="Ask about your mail"
          />
          <div className="flex items-center justify-end gap-2">
            {configured ? null : (
              <Button type="button" variant="ghost" onClick={onOpenSettings}>
                Settings
              </Button>
            )}
            <Button type="submit" disabled={pending || prompt.trim().length < 2}>
              {pending ? "Looking…" : "Ask"}
            </Button>
          </div>
        </form>
        {answer ? (
          <div className="mt-8">
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{answer.answer}</p>
            {answer.threads.length > 0 ? (
              <ul className="mt-5 flex flex-col gap-1">
                {answer.threads.map((thread) => (
                  <li key={thread.id}>
                    <Hit thread={thread} ownEmails={ownEmails} onOpen={onOpenThread} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Hit({
  thread,
  ownEmails,
  onOpen,
}: {
  thread: ThreadSummary;
  ownEmails: ReadonlySet<string>;
  onOpen: (threadId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(thread.id)}
      className="flex w-full flex-col gap-0.5 rounded-2xl px-3 py-3 text-left hover:bg-accent"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[13px] font-medium">{threadSender(thread, ownEmails)}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {formatThreadTime(thread.lastMessageAt)}
        </span>
      </span>
      <span className="truncate text-[13px]">{displaySubject(thread.subject)}</span>
    </button>
  );
}
