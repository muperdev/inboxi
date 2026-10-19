"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  const [provider, setProvider] = useState<ProviderId | null>(
    initialProvider === "gmail" ? null : initialProvider,
  );
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
  const google = useMutation({
    mutationFn: mailApi.connectGoogle,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("Inbox connected. Mail is coming in.");
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not connect.");
    },
  });
  const startGoogle = google.mutate;
  const startedGoogle = useRef(false);

  useEffect(() => {
    if (initialProvider !== "gmail" || startedGoogle.current) return;
    startedGoogle.current = true;
    startGoogle();
  }, [initialProvider, startGoogle]);

  if (!provider || !preset) {
    return (
      <div className="grid gap-5">
        <DialogHeader>
          <DialogTitle>Connect an inbox</DialogTitle>
        </DialogHeader>
        <div className="grid">
          {providerPresets.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.id === "gmail" && google.isPending}
              onClick={() => {
                if (item.id === "gmail") {
                  if (!google.isPending) google.mutate();
                  return;
                }
                setProvider(item.id);
                setImapHost(item.imapHost);
                setSmtpHost(item.smtpHost);
              }}
              className="flex items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-60"
            >
              <ProviderLogo id={item.id} />
              <span className="text-sm font-medium">
                {item.id === "gmail" && google.isPending ? "Waiting for Google…" : item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-6"
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
        <DialogDescription>Use an app password, not the password for the account.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="username" />
        <Field
          label="Name"
          value={displayName}
          onChange={setDisplayName}
          placeholder="How you want to appear"
        />
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="mail-password">App password</Label>
            <span className="flex items-center gap-3">
              {preset.helpHref ? (
                <a
                  href={preset.helpHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground underline underline-offset-3 hover:text-foreground"
                >
                  Create one
                </a>
              ) : null}
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
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
      <DialogFooter>
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

function ProviderLogo({ id }: { id: ProviderId }) {
  if (id === "gmail") return <GmailLogo />;
  if (id === "icloud") return <IcloudLogo />;
  return <ImapLogo />;
}

function GmailLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden>
      <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z" />
      <path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z" />
      <path fill="#e53935" d="M35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17z" />
      <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0C4.924,8,3,9.924,3,12.298z" />
      <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0C43.076,8,45,9.924,45,12.298z" />
    </svg>
  );
}

function IcloudLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
      <path
        fill="#3693f5"
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4a7.48 7.48 0 0 0-6.65 4.04A6 6 0 0 0 6 20h13a5 5 0 0 0 .35-9.96"
      />
    </svg>
  );
}

function ImapLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted-foreground" aria-hidden>
      <path
        fill="currentColor"
        d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 4-8 5-8-5V6l8 5 8-5z"
      />
    </svg>
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
    <div className="grid gap-3">
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
