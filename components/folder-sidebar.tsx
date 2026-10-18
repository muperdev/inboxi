"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  FileText,
  Inbox,
  Moon,
  MoreHorizontal,
  PenLine,
  Plus,
  Send,
  Settings,
  Sparkles,
  ShieldAlert,
  Star,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import { isEmail, nameFromEmail, normalizeEmail } from "@/lib/format";
import { mailApi } from "@/lib/mail-api";
import type { Account, Folder, Identity, MailFolder } from "@/lib/mail-types";

const folderNav: ReadonlyArray<{ id: MailFolder; label: string; icon: LucideIcon }> = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "junk", label: "Junk", icon: ShieldAlert },
  { id: "trash", label: "Trash", icon: Trash2 },
];

type FolderSidebarProps = {
  accounts: Account[];
  identities: Identity[];
  folders: Folder[];
  folder: MailFolder;
  accountId: string | null;
  alias: string | null;
  onFolder: (folder: MailFolder) => void;
  onAccount: (accountId: string | null) => void;
  onIdentity: (email: string, accountId: string) => void;
  onCompose: () => void;
  onAssistant: () => void;
  assistantActive: boolean;
  onSettings: () => void;
  onConnect: () => void;
  onNavigate?: () => void;
};

export function FolderSidebar({
  accounts,
  identities,
  folders,
  folder,
  accountId,
  alias,
  onFolder,
  onAccount,
  onIdentity,
  onCompose,
  onAssistant,
  assistantActive,
  onSettings,
  onConnect,
  onNavigate,
}: FolderSidebarProps) {
  const [aliasFor, setAliasFor] = useState<Account | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Account | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-5">
        <p className="flex items-center gap-2.5 px-3 font-display text-[22px] leading-none font-normal tracking-[-0.03em]">
          {/* The mark is a local 28px asset. next/image would pull sharp into the desktop build. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={28} height={28} className="size-7 rounded-lg" />
          <span>
            Mail<em className="font-light italic">right</em>
          </span>
        </p>
      </div>
      <nav className="mt-4 flex flex-col gap-0.5 px-3" aria-label="Folders">
        <button
          type="button"
          onClick={() => {
            onCompose();
            onNavigate?.();
          }}
          className="flex h-10 w-full items-center gap-2.5 rounded-full bg-primary px-3 text-[13px] font-medium tracking-[-0.012em] text-primary-foreground transition-colors hover:bg-primary/88 active:scale-[0.98]"
        >
          <PenLine className="size-4" />
          Compose
        </button>
        <button
          type="button"
          onClick={() => {
            onAssistant();
            onNavigate?.();
          }}
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground",
            assistantActive && "bg-sidebar-accent text-foreground",
          )}
        >
          <Sparkles className="size-4" />
          Assistant
        </button>
        {folderNav.map((item) => {
          const count = badgeCount(item.id, accounts, folders, accountId);
          const active = folder === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onFolder(item.id);
                onNavigate?.();
              }}
              className={cn(
                "flex h-10 w-full items-center gap-2.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground",
                active && "bg-sidebar-accent text-foreground",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {count > 0 ? (
                <span className="text-[11px] font-medium tabular-nums text-lavender">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="mt-7 min-h-0 flex-1 overflow-y-auto px-3">
        <p className="px-3 pb-2 text-[10.5px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Accounts
        </p>
        {accounts.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              onAccount(null);
              onNavigate?.();
            }}
            className={cn(
              "flex h-10 w-full items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
              !accountId && !alias && "bg-sidebar-accent text-foreground",
            )}
          >
            All inboxes
          </button>
        ) : null}
        <div className="mt-1 flex flex-col gap-1">
          {accounts.map((account) => (
            <AccountBlock
              key={account.id}
              account={account}
              identities={identities.filter((identity) => identity.accountId === account.id)}
              active={accountId === account.id && !alias}
              alias={accountId === account.id ? alias : null}
              onSelect={() => {
                onAccount(accountId === account.id && !alias ? null : account.id);
                onNavigate?.();
              }}
              onAlias={(email) => {
                onIdentity(email, account.id);
                onNavigate?.();
              }}
              onAddAlias={() => setAliasFor(account)}
              onRemove={() => setRemoveTarget(account)}
            />
          ))}
        </div>
      </div>
      <footer className="flex items-center justify-between px-3 py-4">
        <Button variant="ghost" size="sm" onClick={onConnect}>
          <Plus />
          Add account
        </Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label="Settings" onClick={onSettings}>
            <Settings />
          </Button>
          <ThemeToggle />
        </div>
      </footer>
      <AliasDialog account={aliasFor} onOpenChange={(open) => !open && setAliasFor(null)} />
      <RemoveAccountDialog
        account={removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      />
    </div>
  );
}

function badgeCount(
  folder: MailFolder,
  accounts: Account[],
  folders: Folder[],
  accountId: string | null,
): number {
  const visible = accountId ? accounts.filter((account) => account.id === accountId) : accounts;
  if (folder === "inbox") return visible.reduce((sum, account) => sum + account.inboxUnread, 0);
  if (folder === "starred") return visible.reduce((sum, account) => sum + account.starredCount, 0);
  if (folder === "drafts" || folder === "junk") {
    return folders.reduce((sum, item) => {
      if (item.role !== folder) return sum;
      if (accountId && item.accountId !== accountId) return sum;
      return sum + (folder === "drafts" ? item.totalCount : item.unreadCount);
    }, 0);
  }
  return 0;
}

function AccountBlock({
  account,
  identities,
  active,
  alias,
  onSelect,
  onAlias,
  onAddAlias,
  onRemove,
}: {
  account: Account;
  identities: Identity[];
  active: boolean;
  alias: string | null;
  onSelect: () => void;
  onAlias: (email: string) => void;
  onAddAlias: () => void;
  onRemove: () => void;
}) {
  const syncing = account.syncStatus === "syncing" || account.syncStatus === "connecting";
  const aliases = identities.filter((identity) => !identity.isPrimary);

  return (
    <div className={cn("rounded-2xl", active && "bg-sidebar-accent")}>
      <div className="flex items-start gap-1 pr-1">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 px-3 py-2 text-left">
          <span className="flex items-center gap-2">
            <span
              className={cn("size-1.5 shrink-0 rounded-full", syncing && "animate-pulse")}
              style={{
                backgroundColor: account.syncStatus === "error" ? "var(--destructive)" : account.color,
              }}
              title={account.syncError ?? undefined}
            />
            <span className="truncate text-[13px] font-medium">{account.displayName}</span>
          </span>
          <span className="block truncate pl-3.5 text-[11px] text-muted-foreground">
            {account.syncStatus === "error" ? "Sign-in failed" : account.email}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="mt-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Options for ${account.email}`}
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddAlias}>Add alias</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              Remove account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {aliases.length > 0 ? (
        <div className="pb-1">
          {aliases.map((identity) => (
            <button
              key={identity.id}
              type="button"
              onClick={() => onAlias(identity.email)}
              className={cn(
                "block w-full truncate rounded-full py-1.5 pr-3 pl-8 text-left text-[12px] text-muted-foreground hover:bg-background/60 hover:text-foreground",
                alias === identity.email && "font-medium text-lavender",
              )}
            >
              {identity.email}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const dark = ready && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function AliasDialog({
  account,
  onOpenChange,
}: {
  account: Account | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const add = useMutation({
    mutationFn: (alias: { email: string; displayName: string }) => {
      if (!account) throw new Error("Choose an account.");
      return mailApi.addAlias(account.id, alias);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("Alias added");
      setEmail("");
      setDisplayName("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not add that alias.");
    },
  });

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add alias</DialogTitle>
          <DialogDescription>
            Mail to this address stays in {account?.email ?? "the account"} and can be filtered on its own.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = normalizeEmail(email);
            if (!isEmail(normalized)) {
              toast.error("Enter a valid alias address.");
              return;
            }
            add.mutate({
              email: normalized,
              displayName: displayName.trim() || nameFromEmail(normalized),
            });
          }}
        >
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@domain.com"
            type="email"
            required
            aria-label="Alias email"
          />
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Name"
            aria-label="Alias name"
          />
          <DialogFooter>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Add alias"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveAccountDialog({
  account,
  onOpenChange,
}: {
  account: Account | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => {
      if (!account) throw new Error("Choose an account.");
      return mailApi.removeAccount(account.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("Account removed");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not remove that account.");
    },
  });

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {account?.email}?</DialogTitle>
          <DialogDescription>
            Mail stays on the server. This only removes it from Mailright on this computer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
