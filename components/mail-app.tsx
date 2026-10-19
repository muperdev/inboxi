"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { toast } from "sonner";
import { AssistantPanel } from "@/components/assistant-panel";
import { ComposePane } from "@/components/compose-dialog";
import { ConnectAccountDialog } from "@/components/connect-account-dialog";
import { FolderSidebar } from "@/components/folder-sidebar";
import { ReadingPane } from "@/components/reading-pane";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThreadList } from "@/components/thread-list";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMailShortcuts } from "@/hooks/use-mail-shortcuts";
import { useQuery } from "@tanstack/react-query";
import { useBootstrap, useMailEvents, useSearch, useThread, useThreadAction, useThreads } from "@/hooks/use-mailbox";
import { threadSender } from "@/lib/format";
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
  const [search, setSearch] = useState("");
  const [replySignal, setReplySignal] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const bootstrap = useBootstrap();
  const assistantSettings = useQuery({ queryKey: ["settings"], queryFn: mailApi.settings });
  const threads = useThreads({ folder, accountId, alias, limit });
  const remoteSearch = useSearch(deferredSearch);
  const thread = useThread(threadId);
  const action = useThreadAction();
  useMailEvents();

  useEffect(() => {
    setLimit(200);
    setSearch("");
  }, [folder, accountId, alias]);

  useEffect(() => {
    const bridge = (globalThis as { mailright?: { desktop?: boolean } }).mailright;
    if (!bridge?.desktop) return;
    document.documentElement.classList.add("desktop");
    return () => document.documentElement.classList.remove("desktop");
  }, []);

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
  const visibleThreads = useMemo(() => {
    if (deferredSearch.length === 0) return threadRows;
    if (deferredSearch.length > 1 && remoteSearch.data) return remoteSearch.data;
    const needle = deferredSearch.toLowerCase();
    return threadRows.filter((item) =>
      `${threadSender(item, ownEmails)} ${item.subject} ${item.snippet}`.toLowerCase().includes(needle),
    );
  }, [deferredSearch, threadRows, remoteSearch.data, ownEmails]);
  const syncing = accounts.some(
    (account) => account.syncStatus === "syncing" || account.syncStatus === "connecting",
  );
  const syncDone = accounts.reduce((sum, account) => sum + account.syncDone, 0);
  const syncTotal = accounts.reduce((sum, account) => sum + account.syncTotal, 0);

  const openConnect = (provider: ProviderId | null) => {
    setConnectProvider(provider);
    setConnectOpen(true);
  };

  const runAction = (threadToAct: string, kind: "archive" | "trash" | "star" | "unread") => {
    const current = visibleThreads.find((item) => item.id === threadToAct);
    if (kind === "archive" || kind === "trash") {
      const index = visibleThreads.findIndex((item) => item.id === threadToAct);
      const next = visibleThreads[index + 1] ?? visibleThreads[index - 1];
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
    onSearch: () => searchRef.current?.focus(),
    onMove: (delta) => {
      if (assistantOpen || visibleThreads.length === 0) return;
      const index = visibleThreads.findIndex((item) => item.id === threadId);
      const nextIndex =
        index === -1 ? 0 : Math.min(visibleThreads.length - 1, Math.max(0, index + delta));
      const next = visibleThreads[nextIndex];
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
    onBack: () => {
      if (composeOpen) {
        setComposeOpen(false);
        return;
      }
      replace(assistantOpen ? { assistant: null } : { thread: null });
    },
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
      onAssistant={() => replace({ assistant: assistantOpen ? null : "1", thread: null })}
      assistantActive={assistantOpen}
      onSettings={() => setSettingsOpen(true)}
      onConnect={() => openConnect(null)}
      onNavigate={() => setSidebarOpen(false)}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-sidebar text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border md:flex md:flex-col">{sidebar}</aside>
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[280px] bg-sidebar p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Folders</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
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
          <div className={threadId || composeOpen ? "hidden min-w-0 flex-1 border-r border-border/70 lg:flex lg:w-[400px] lg:flex-none lg:flex-col" : "flex min-w-0 flex-1 flex-col border-r border-border/70 lg:w-[400px] lg:flex-none"}>
            <ThreadList
              folder={folder}
              threads={visibleThreads}
              selectedId={threadId}
              ownEmails={ownEmails}
              loading={threads.isPending && deferredSearch.length === 0}
              searching={deferredSearch.length > 1 && remoteSearch.isFetching && !remoteSearch.data}
              query={search}
              syncing={syncing}
              syncDone={syncDone}
              syncTotal={syncTotal}
              hasMore={deferredSearch.length === 0 && threadRows.length >= limit}
              searchRef={searchRef}
              onQuery={setSearch}
              onSelect={(id) => {
                setComposeOpen(false);
                replace({ thread: id });
                const current = visibleThreads.find((item) => item.id === id);
                if (current?.unread) action.mutate({ threadId: id, action: "read", folder });
              }}
              onCompose={() => setComposeOpen(true)}
              onAction={runAction}
              onOpenSidebar={() => setSidebarOpen(true)}
              onLoadMore={() => setLimit((current) => current + 200)}
            />
          </div>
          <div className={threadId || composeOpen ? "flex min-w-0 flex-1 flex-col" : "hidden min-w-0 flex-1 lg:flex lg:flex-col"}>
            {composeOpen ? (
              <ComposePane
                identities={identities}
                defaultIdentityId={
                  identities.find((identity) => identity.accountId === accountId)?.id ??
                  identities.find((identity) => identity.isPrimary)?.id ??
                  null
                }
                onClose={() => setComposeOpen(false)}
              />
            ) : (
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
            )}
          </div>
        </>
      )}
      <ConnectAccountDialog
        open={connectOpen}
        initialProvider={connectProvider}
        onOpenChange={setConnectOpen}
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
        <Button size="lg" variant="outline" onClick={() => onConnect("gmail")}>
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}
