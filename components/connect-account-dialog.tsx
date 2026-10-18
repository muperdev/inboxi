"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import { isEmail, nameFromEmail, normalizeEmail } from "@/lib/format";
import { mailApi } from "@/lib/mail-api";
import type { ProviderId } from "@/lib/mail-types";
import { presetFor, providerPresets } from "@/lib/providers";

type AliasDraft = { key: string; email: string; displayName: string };

type ConnectAccountDialogProps = {
  open: boolean;
  initialProvider: ProviderId | null;
  onOpenChange: (open: boolean) => void;
};

export function ConnectAccountDialog({
  open,
  initialProvider,
  onOpenChange,
}: ConnectAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        {open ? (
          <ConnectForm
            key={initialProvider ?? "choose"}
            initialProvider={initialProvider}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ConnectForm({
  initialProvider,
  onClose,
}: {
  initialProvider: ProviderId | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<ProviderId | null>(initialProvider);
  const preset = provider ? presetFor(provider) : null;
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [imapHost, setImapHost] = useState(preset?.imapHost ?? "");
  const [smtpHost, setSmtpHost] = useState(preset?.smtpHost ?? "");
  const [aliases, setAliases] = useState<AliasDraft[]>([]);

  const connect = useMutation({
    mutationFn: mailApi.connect,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("Inbox connected. Mail is coming in.");
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not connect.");
    },
  });

  if (!provider || !preset) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Connect an inbox</DialogTitle>
          <DialogDescription>
            iCloud custom domains and Gmail send-as addresses are aliases on one login.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {providerPresets.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setProvider(item.id);
                setImapHost(item.imapHost);
                setSmtpHost(item.smtpHost);
              }}
              className="rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted"
            >
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.description}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = normalizeEmail(email);
        if (!isEmail(normalized)) {
          toast.error("Enter a valid email address.");
          return;
        }
        connect.mutate({
          provider,
          email: normalized,
          displayName: displayName.trim() || nameFromEmail(normalized),
          password,
          username: normalizeEmail(username || normalized),
          imapHost: imapHost.trim(),
          imapPort: preset.imapPort,
          smtpHost: smtpHost.trim(),
          smtpPort: preset.smtpPort,
          smtpSecure: preset.smtpSecure,
          aliases: aliases.flatMap((alias) => {
            const aliasEmail = normalizeEmail(alias.email);
            if (!isEmail(aliasEmail) || aliasEmail === normalized) return [];
            return [
              {
                email: aliasEmail,
                displayName: alias.displayName.trim() || nameFromEmail(aliasEmail),
              },
            ];
          }),
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Connect {preset.label}</DialogTitle>
        <DialogDescription>
          {preset.help}{" "}
          {preset.helpHref ? (
            <a href={preset.helpHref} target="_blank" rel="noreferrer">
              Open the password page
            </a>
          ) : null}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
        <Field
          label="Name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="How you want to appear"
        />
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="mail-password">App password</Label>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <Input
            id="mail-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {provider === "imap" ? (
          <>
            <Field label="Username" value={username} onChange={setUsername} placeholder="Usually the email" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="IMAP host" value={imapHost} onChange={setImapHost} />
              <Field label="SMTP host" value={smtpHost} onChange={setSmtpHost} />
            </div>
          </>
        ) : null}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Aliases</p>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() =>
                setAliases((current) => [
                  ...current,
                  { key: crypto.randomUUID(), email: "", displayName: "" },
                ])
              }
            >
              Add alias
            </button>
          </div>
          {aliases.map((alias) => (
            <div key={alias.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                value={alias.email}
                placeholder="you@domain.com"
                aria-label="Alias email"
                onChange={(event) =>
                  setAliases((current) =>
                    current.map((item) =>
                      item.key === alias.key ? { ...item, email: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                value={alias.displayName}
                placeholder="Name"
                aria-label="Alias name"
                onChange={(event) =>
                  setAliases((current) =>
                    current.map((item) =>
                      item.key === alias.key
                        ? { ...item, displayName: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAliases((current) => current.filter((item) => item.key !== alias.key))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={() => setProvider(null)}>
          Back
        </Button>
        <Button type="submit" disabled={connect.isPending}>
          {connect.isPending ? "Checking login…" : "Connect inbox"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = `connect-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        required={label !== "Name" && label !== "Username"}
      />
    </div>
  );
}
