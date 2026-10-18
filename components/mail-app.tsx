"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, startTransition } from "react";
import { toast } from "sonner";
import { AssistantPanel } from "@/components/assistant-panel";
import { ComposeDialog } from "@/components/compose-dialog";
import { ConnectAccountDialog } from "@/components/connect-account-dialog";
import { FolderSidebar } from "@/components/folder-sidebar";
import { ReadingPane } from "@/components/reading-pane";
import { SearchDialog } from "@/components/search-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThreadList } from "@/components/thread-list";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMailShortcuts } from "@/hooks/use-mail-shortcuts";
import { useQuery } from "@tanstack/react-query";
import { useBootstrap, useMailEvents, useThread, useThreadAction, useThreads } from "@/hooks/use-mailbox";
import { mailApi } from "@/lib/mail-api";
import { parseMailFolder } from "@/lib/mail-types";
import type { ProviderId } from "@/lib/mail-types";

export function MailFallback() {
  return <div className="h-dvh bg-background" />;
}

export function MailApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const folder = parseMailFolder(searchParams.get("folder"));
  const accountId = searchParams.get("account");
  const alias = searchParams.get("alias");
  const threadId = searchParams.get("thread");
  const assistantOpen = searchParams.get("assistant") === "1";
  const [limit, setLimit] = useState(200);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectProvider, setConnectProvider] = useState<ProviderId | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [replySignal, setReplySignal] = useState(0);

  const bootstrap = useBootstrap();
  const assistantSettings = useQuery({ queryKey: ["settings"], queryFn: mailApi.settings });
  const threads = useThreads({ folder, accountId, alias, limit });
  const thread = useThread(threadId);
  const action = useThreadAction();
  useMailEvents();

  useEffect(() => {
    setLimit(200);
  }, [folder, accountId, alias]);

  const replace = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const accounts = bootstrap.data?.accounts ?? [];
  const identities = bootstrap.data?.identities ?? [];
  const folders = bootstrap.data?.folders ?? [];
  const ownEmails = useMemo(
    () => new Set(identities.map((identity) => identity.email)),
    [identities],
  );
  const threadRows = threads.data ?? [];
  const syncing = accounts.some(
    (account) => account.syncStatus === "syncing" || account.syncStatus === "connecting",
  );

  const openConnect = (provider: ProviderId | null) => {
    setConnectProvider(provider);
    setConnectOpen(true);
  };

  const runAction = (threadToAct: string, kind: "archive" | "trash" | "star" | "unread") => {
    const current = threadRows.find((item) => item.id === threadToAct);
    if (kind === "archive" || kind === "trash") {
      const index = threadRows.findIndex((item) => item.id === threadToAct);
      const next = threadRows[index + 1] ?? threadRows[index - 1];
      replace({ thread: next?.id ?? null });
      action.mutate(
        { threadId: threadToAct, action: kind === "trash" && folder === "trash" ? "delete" : kind, folder },
        { onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update mail.") },
      );
      return;
    }
    if (!current) return;
    action.mutate(
      {
        threadId: threadToAct,
        folder,
        action:
          kind === "star"
            ? current.starred
              ? "unstar"
              : "star"
            : current.unread
              ? "read"
              : "unread",
      },
      { onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update mail.") },
    );
  };

  useMailShortcuts({
    onCompose: () => setComposeOpen(true),
    onSearch: () => setSearchOpen(true),
    onMove: (delta) => {
      if (assistantOpen || threadRows.length === 0) return;
      const index = threadRows.findIndex((item) => item.id === threadId);
      const nextIndex =
        index === -1 ? 0 : Math.min(threadRows.length - 1, Math.max(0, index + delta));
      const next = threadRows[nextIndex];
      if (next) replace({ thread: next.id });
    },
    onArchive: () => {
      if (!assistantOpen && threadId) runAction(threadId, "archive");
    },
    onTrash: () => {
      if (!assistantOpen && threadId) runAction(threadId, "trash");
    },
    onStar: () => {
      if (!assistantOpen && threadId) runAction(threadId, "star");
    },
    onUnread: () => {
      if (!assistantOpen && threadId) runAction(threadId, "unread");
    },
    onReply: () => {
      if (!assistantOpen) setReplySignal((current) => current + 1);
    },
    onBack: () => replace(assistantOpen ? { assistant: null } : { thread: null }),
  });

  if (bootstrap.isError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">The mail server isn’t running</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Start it with <span className="font-mono text-xs">bun dev</span>. It stays on this computer and syncs iCloud and Gmail over IMAP.
        </p>
        <Button variant="outline" onClick={() => void bootstrap.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const sidebar = (
    <FolderSidebar
      accounts={accounts}
      identities={identities}
      folders={folders}
      folder={folder}
      accountId={accountId}
      alias={alias}
      onFolder={(next) => replace({ folder: next === "inbox" ? null : next, thread: null, assistant: null })}
      onAccount={(next) => replace({ account: next, alias: null, thread: null, assistant: null })}
      onIdentity={(email, nextAccount) => replace({ account: nextAccount, alias: email, thread: null, assistant: null })}
      onCompose={() => setComposeOpen(true)}
      onAssistant={() => replace({ assistant: assistantOpen ? null : "1", thread: null })}
      assistantActive={assistantOpen}
      onSettings={() => setSettingsOpen(true)}
      onConnect={() => openConnect(null)}
      onNavigate={() => setSidebarOpen(false)}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-sidebar text-foreground">
      <aside className="hidden w-60 shrink-0 md:flex md:flex-col">{sidebar}</aside>
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Folders</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background md:my-2 md:mr-2 md:rounded-[1rem] md:shadow-[inset_0_1px_0_rgb(255_255_255/0.55)]">
      {bootstrap.isPending ? (
        <div className="flex-1" />
      ) : assistantOpen ? (
        <AssistantPanel
          ownEmails={ownEmails}
          configured={assistantSettings.data?.configured ?? false}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenThread={(id) => replace({ thread: id, assistant: null })}
        />
      ) : accounts.length === 0 ? (
        <Welcome onConnect={openConnect} />
      ) : (
        <>
          <div className={threadId ? "hidden min-w-0 flex-1 border-r border-border/70 lg:flex lg:w-[400px] lg:flex-none lg:flex-col" : "flex min-w-0 flex-1 flex-col border-r border-border/70 lg:w-[400px] lg:flex-none"}>
            <ThreadList
              folder={folder}
              threads={threadRows}
              selectedId={threadId}
              ownEmails={ownEmails}
              showAccount={!accountId}
              loading={threads.isPending}
              syncing={syncing}
              hasMore={threadRows.length >= limit}
              onSelect={(id) => replace({ thread: id })}
              onSearch={() => setSearchOpen(true)}
              onOpenSidebar={() => setSidebarOpen(true)}
              onLoadMore={() => setLimit((current) => current + 200)}
            />
          </div>
          <div className={threadId ? "flex min-w-0 flex-1 flex-col" : "hidden min-w-0 flex-1 lg:flex lg:flex-col"}>
            <ReadingPane
              thread={thread.data}
              loading={thread.isFetching && !thread.data}
              folder={folder}
              folders={folders}
              identities={identities}
              ownEmails={ownEmails}
              replySignal={replySignal}
              onBack={() => replace({ thread: null })}
              onArchive={() => threadId && runAction(threadId, "archive")}
              onTrash={() => threadId && runAction(threadId, "trash")}
              onStar={() => threadId && runAction(threadId, "star")}
              onUnread={() => threadId && runAction(threadId, "unread")}
              onRead={() => {
                if (!threadId) return;
                const current = threadRows.find((item) => item.id === threadId);
                if (current && !current.unread) return;
                action.mutate({ threadId, action: "read", folder });
              }}
            />
          </div>
        </>
      )}
      <ConnectAccountDialog
        open={connectOpen}
        initialProvider={connectProvider}
        onOpenChange={setConnectOpen}
      />
      <ComposeDialog
        open={composeOpen}
        identities={identities}
        defaultIdentityId={
          identities.find((identity) => identity.accountId === accountId)?.id ??
          identities.find((identity) => identity.isPrimary)?.id ??
          null
        }
        onOpenChange={setComposeOpen}
      />
      <SearchDialog
        open={searchOpen}
        ownEmails={ownEmails}
        onOpenChange={setSearchOpen}
        onSelect={(id) => replace({ thread: id })}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>
    </div>
  );
}

function Welcome({ onConnect }: { onConnect: (provider: ProviderId | null) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <h1 className="font-display text-[40px] leading-[1.02] font-normal tracking-[-0.03em] text-foreground sm:text-[48px]">
        A quiet inbox.
        <em className="mt-1 block font-light italic">On this computer.</em>
      </h1>
      <p className="mt-5 max-w-sm text-[15px] leading-relaxed tracking-[-0.01em] text-muted-foreground">
        Connect iCloud, including custom domains, and Gmail. Aliases share an account.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
        <Button size="lg" onClick={() => onConnect("icloud")}>
          Connect iCloud
        </Button>
        <Button variant="ghost" size="lg" className="px-0 hover:bg-transparent hover:underline" onClick={() => onConnect("gmail")}>
          Connect Gmail
        </Button>
      </div>
    </div>
  );
}
