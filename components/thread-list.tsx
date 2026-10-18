"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Menu, Search, Star } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { displaySubject, emptyFolderCopy, folderLabel, formatThreadTime, threadSender } from "@/lib/format";
import type { MailFolder, ThreadSummary } from "@/lib/mail-types";

type ThreadListProps = {
  folder: MailFolder;
  threads: ThreadSummary[];
  selectedId: string | null;
  ownEmails: ReadonlySet<string>;
  showAccount: boolean;
  loading: boolean;
  syncing: boolean;
  hasMore: boolean;
  onSelect: (threadId: string) => void;
  onSearch: () => void;
  onOpenSidebar: () => void;
  onLoadMore: () => void;
};

export function ThreadList({
  folder,
  threads,
  selectedId,
  ownEmails,
  showAccount,
  loading,
  syncing,
  hasMore,
  onSelect,
  onSearch,
  onOpenSidebar,
  onLoadMore,
}: ThreadListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  useEffect(() => {
    const index = threads.findIndex((thread) => thread.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [selectedId, threads, virtualizer]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-end justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex min-w-0 items-end gap-2">
          <Button variant="ghost" size="icon-sm" className="mb-0.5 md:hidden" aria-label="Folders" onClick={onOpenSidebar}>
            <Menu />
          </Button>
          <h1 className="font-display text-[28px] leading-none font-normal tracking-[-0.03em]">
            {folderLabel(folder)}
          </h1>
        </div>
        {syncing ? <span className="pb-1 text-xs text-muted-foreground">Syncing</span> : null}
      </header>
      <button
        type="button"
        onClick={onSearch}
        className="mx-4 mb-3 flex h-10 items-center gap-2 rounded-full bg-muted/80 px-3.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search mail</span>
        <kbd className="text-[10px] tracking-widest text-muted-foreground/80">/</kbd>
      </button>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 px-4 py-2">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="px-8 py-20 text-center">
            <p className="font-display text-[26px] leading-[1.05] font-normal tracking-[-0.03em]">
              Nothing here.
              <em className="mt-1 block font-light italic">{folderLabel(folder)} is clear.</em>
            </p>
            <p className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              {emptyFolderCopy(folder)}
            </p>
          </div>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const thread = threads[item.index];
              if (!thread) return null;
              return (
                <div
                  key={thread.id}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full px-3"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <ThreadRow
                    thread={thread}
                    selected={thread.id === selectedId}
                    ownEmails={ownEmails}
                    showAccount={showAccount}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        )}
        {hasMore ? (
          <div className="px-3 py-3">
            <Button variant="ghost" size="sm" className="w-full" onClick={onLoadMore}>
              Older mail
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

const ThreadRow = memo(function ThreadRow({
  thread,
  selected,
  ownEmails,
  showAccount,
  onSelect,
}: {
  thread: ThreadSummary;
  selected: boolean;
  ownEmails: ReadonlySet<string>;
  showAccount: boolean;
  onSelect: (threadId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(thread.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted/70",
        selected && "bg-accent hover:bg-accent",
      )}
    >
      <span className="flex items-center gap-2">
        {thread.unread ? <span className="size-1.5 shrink-0 rounded-full bg-lavender" /> : <span className="size-1.5 shrink-0" />}
        {showAccount ? (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: thread.accountColor }}
          />
        ) : null}
        <span className={cn("min-w-0 flex-1 truncate text-[13px]", thread.unread ? "font-semibold" : "font-medium")}>
          {threadSender(thread, ownEmails)}
        </span>
        {thread.starred ? <Star className="size-3 shrink-0 fill-current text-lavender" /> : null}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatThreadTime(thread.lastMessageAt)}
        </span>
      </span>
      <span className={cn("truncate pl-0 text-[13px]", thread.unread ? "font-medium" : "text-foreground/80")}>
        {displaySubject(thread.subject)}
        {thread.messageCount > 1 ? (
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">{thread.messageCount}</span>
        ) : null}
      </span>
      <span className="truncate text-[12px] text-muted-foreground">
        {thread.snippet || "No preview"}
      </span>
    </button>
  );
});
