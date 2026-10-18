"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RewriteDraft } from "@/components/rewrite-draft";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isEmail, normalizeEmail } from "@/lib/format";
import { mailApi } from "@/lib/mail-api";
import type { Identity } from "@/lib/mail-types";

type ComposeDialogProps = {
  open: boolean;
  identities: Identity[];
  defaultIdentityId: string | null;
  onOpenChange: (open: boolean) => void;
};

export function ComposeDialog({
  open,
  identities,
  defaultIdentityId,
  onOpenChange,
}: ComposeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>Send from any connected address or alias.</DialogDescription>
        </DialogHeader>
        {open ? (
          <ComposeForm
            key={defaultIdentityId ?? "new"}
            identities={identities}
            defaultIdentityId={defaultIdentityId}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ComposeForm({
  identities,
  defaultIdentityId,
  onClose,
}: {
  identities: Identity[];
  defaultIdentityId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [identityId, setIdentityId] = useState(
    defaultIdentityId ?? identities[0]?.id ?? "",
  );
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
    <form
      className="grid gap-3"
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
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">From</span>
        <select
          value={identityId}
          onChange={(event) => setIdentityId(event.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {identities.map((identity) => (
            <option key={identity.id} value={identity.id}>
              {identity.displayName} · {identity.email}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="compose-to">To</Label>
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
        <Input
          id="compose-to"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="name@domain.com"
          required
        />
      </div>
      {showCc ? (
        <div className="grid gap-1.5">
          <Label htmlFor="compose-cc">Cc</Label>
          <Input id="compose-cc" value={cc} onChange={(event) => setCc(event.target.value)} />
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="compose-subject">Subject</Label>
        <Input id="compose-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
      </div>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Write…"
        className="min-h-40"
        required
      />
      <RewriteDraft text={text} subject={subject} onChange={setText} />
      <DialogFooter>
        <Button type="submit" disabled={send.isPending || identities.length === 0}>
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      </DialogFooter>
    </form>
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
