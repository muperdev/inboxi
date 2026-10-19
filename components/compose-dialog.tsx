"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { RewriteDraft } from "@/components/rewrite-draft";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isEmail, normalizeEmail } from "@/lib/format";
import { mailApi } from "@/lib/mail-api";
import type { Identity } from "@/lib/mail-types";

type ComposePaneProps = {
  identities: Identity[];
  defaultIdentityId: string | null;
  onClose: () => void;
};

export function ComposePane({ identities, defaultIdentityId, onClose }: ComposePaneProps) {
  const queryClient = useQueryClient();
  const [identityId, setIdentityId] = useState(defaultIdentityId ?? identities[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");

  const send = useMutation({
    mutationFn: mailApi.send,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["threads"] });
      toast.success("Sent");
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not send.");
    },
  });

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="message-titlebar flex items-center gap-3 px-5 pt-8 pb-5 md:px-8">
        <h2 className="min-w-0 flex-1 font-display text-[26px] leading-[1.12] font-normal tracking-[-0.03em] md:text-[30px]">
          New message
        </h2>
        <Button type="submit" form="compose-form" disabled={send.isPending || identities.length === 0}>
          {send.isPending ? "Sending…" : "Send"}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </header>
      <form
        id="compose-form"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onSubmit={(event) => {
          event.preventDefault();
          const identity = identities.find((item) => item.id === identityId);
          if (!identity) {
            toast.error("Connect an inbox before sending.");
            return;
          }
          const recipients = splitEmails(to);
          if (recipients.length === 0) {
            toast.error("Add at least one recipient.");
            return;
          }
          send.mutate({
            accountId: identity.accountId,
            identityId: identity.id,
            to: recipients,
            cc: showCc ? splitEmails(cc) : [],
            bcc: [],
            subject,
            text,
          });
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-10 md:px-10">
          <Field label="From">
            <div className="relative min-w-0 flex-1">
              <select
                value={identityId}
                onChange={(event) => setIdentityId(event.target.value)}
                className="h-9 w-full appearance-none bg-transparent pr-8 text-sm outline-none"
              >
                {identities.map((identity) => (
                  <option key={identity.id} value={identity.id}>
                    {identity.displayName} · {identity.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-0 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </Field>
          <div className="flex items-center gap-3 border-b py-1 text-sm">
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <span className="w-16 shrink-0 text-muted-foreground">To</span>
              <input
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="name@domain.com"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                required
              />
            </label>
            {showCc ? null : (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowCc(true)}
              >
                Cc
              </button>
            )}
          </div>
          {showCc ? (
            <Field label="Cc">
              <input
                value={cc}
                onChange={(event) => setCc(event.target.value)}
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </Field>
          ) : null}
          <Field label="Subject">
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </Field>
          <div className="pt-5">
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write…"
              className="min-h-64 resize-none rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
              required
            />
            <div className="pt-3">
              <RewriteDraft text={text} subject={subject} onChange={setText} />
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-3 border-b py-1 text-sm">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function splitEmails(value: string): string[] {
  const emails: string[] = [];
  for (const part of value.split(/[,;\s]+/)) {
    const email = normalizeEmail(part);
    if (!isEmail(email) || emails.includes(email)) continue;
    emails.push(email);
  }
  return emails;
}
