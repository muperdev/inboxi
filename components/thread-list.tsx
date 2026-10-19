"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, Mail, Menu, PenLine, Search, Star, Trash2 } from "lucide-react";
import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "cn";
import { displaySubject, emptyFolderCopy, folderLabel, formatThreadTime, threadSender } from "@/lib/format";
import type { MailFolder, ThreadSummary } from "@/lib/mail-types";

type RowAction = "archive" | "trash" | "star" | "unread";

type ThreadListProps = {
  folder: MailFolder;
  threads: ThreadSummary[];
  selectedId: string | null;
  ownEmails: ReadonlySet<string>;
  loading: boolean;
  searching: boolean;
  query: string;
  syncing: boolean;
  syncDone: number;
  syncTotal: number;
  hasMore: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onSelect: (threadId: string) => void;
  onCompose: () => void;
  onAction: (threadId: string, action: RowAction) => void;
  onOpenSidebar: () => void;
  onLoadMore: () => void;
};

export function ThreadList({
  folder,
  threads,
  selectedId,
  ownEmails,
  loading,
  searching,
  query,
  syncing,
  syncDone,
  syncTotal,
  hasMore,
  searchRef,
  onQuery,
  onSelect,
  onCompose,
  onAction,
  onOpenSidebar,
  onLoadMore,
}: ThreadListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 78,
    overscan: 8,
  });

  useEffect(() => {
    const index = threads.findIndex((thread) => thread.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [selectedId, threads, virtualizer]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="app-titlebar flex items-end justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex min-w-0 items-end gap-2">
          <Button variant="ghost" size="icon-sm" className="mb-0.5 md:hidden" aria-label="Folders" onClick={onOpenSidebar}>
            <Menu />
          </Button>
          <h1 className="font-display text-[28px] leading-none font-normal tracking-[-0.03em]">
            {query.trim() ? "Search" : folderLabel(folder)}
          </h1>
        </div>
        <button
          type="button"
          aria-label="Compose"
          onClick={onCompose}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:bg-primary/88 active:scale-95"
        >
          <PenLine className="size-4" />
        </button>
      </header>
      {syncing ? <SyncBar done={syncDone} total={syncTotal} /> : null}
      <label className="mx-4 mb-2 flex h-10 items-center gap-2 border border-border bg-background px-3 text-[13px] text-muted-foreground">
        <Search className="size-3.5 shrink-0" />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onQuery("");
            event.currentTarget.blur();
          }}
          placeholder="Search mail"
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd className="text-[10px] tracking-widest text-muted-foreground/80">/</kbd>
      </label>
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
              {searching || query.trim() ? "No matches." : "Nothing here."}
              <em className="mt-1 block font-light italic">
                {searching ? "Looking through mail." : query.trim() ? "Try another word." : `${folderLabel(folder)} is clear.`}
              </em>
            </p>
            {query.trim() ? null : (
              <p className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                {emptyFolderCopy(folder)}
              </p>
            )}
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
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <ThreadRow
                    thread={thread}
                    selected={thread.id === selectedId}
                    ownEmails={ownEmails}
                    folder={folder}
                    onSelect={onSelect}
                    onAction={onAction}
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

function SyncBar({ done, total }: { done: number; total: number }) {
  const known = total > 0;
  const width = known ? Math.max(6, Math.min(100, Math.round((done / total) * 100))) : 40;
  return (
    <div
      className="mx-5 mb-3 h-1 overflow-hidden bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={known ? total : undefined}
      aria-valuenow={known ? done : undefined}
      aria-label="Syncing mail"
    >
      <div className={cn("h-full bg-lavender", !known && "animate-pulse")} style={{ width: `${width}%` }} />
    </div>
  );
}

const swipeEase = "cubic-bezier(0.22, 1, 0.36, 1)";
const swipeThreshold = 88;

function resist(distance: number): number {
  const limit = 160;
  const magnitude = Math.abs(distance);
  if (magnitude <= limit) return distance;
  return Math.sign(distance) * (limit + (magnitude - limit) * 0.28);
}

const ThreadRow = memo(function ThreadRow({
  thread,
  selected,
  ownEmails,
  folder,
  onSelect,
  onAction,
}: {
  thread: ThreadSummary;
  selected: boolean;
  ownEmails: ReadonlySet<string>;
  folder: MailFolder;
  onSelect: (threadId: string) => void;
  onAction: (threadId: string, action: RowAction) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"x" | "y" | null>(null);
  const dragged = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const allowArchive = folder !== "archive";

  const move = (value: number) => {
    offsetRef.current = value;
    setOffset(value);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    startX.current = event.clientX;
    startY.current = event.clientY;
    axis.current = null;
    dragged.current = false;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return;
    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;
    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "x") {
        dragged.current = true;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    if (axis.current !== "x") return;
    const next = allowArchive ? dx : Math.min(0, dx);
    move(resist(next));
  };

  const finishSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (axis.current !== "x") {
      axis.current = null;
      return;
    }
    const distance = offsetRef.current;
    axis.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const direction = distance > swipeThreshold ? "right" : distance < -swipeThreshold ? "left" : null;
    if (!direction || (direction === "right" && !allowArchive)) {
      move(0);
      return;
    }
    const width = rowRef.current?.offsetWidth ?? 360;
    move(direction === "right" ? width : -width);
    window.setTimeout(() => {
      onAction(thread.id, direction === "right" ? "archive" : "trash");
      window.setTimeout(() => {
        if (!rowRef.current?.isConnected) return;
        move(0);
      }, 420);
    }, 220);
  };

  const progress = Math.min(1, Math.abs(offset) / swipeThreshold);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="relative block overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
      >
        <div
          className="pointer-events-none absolute inset-0 flex items-center gap-2 bg-[#3d8f62] pl-5 text-white"
          style={{ opacity: offset > 8 ? 1 : 0 }}
        >
          <Archive className="size-4" style={{ transform: `scale(${0.72 + progress * 0.28})` }} />
          <span className="text-sm font-medium" style={{ opacity: progress }}>
            Archive
          </span>
        </div>
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-end gap-2 bg-destructive pr-5 text-white"
          style={{ opacity: offset < -8 ? 1 : 0 }}
        >
          <span className="text-sm font-medium" style={{ opacity: progress }}>
            {folder === "trash" ? "Delete" : "Trash"}
          </span>
          <Trash2 className="size-4" style={{ transform: `scale(${0.72 + progress * 0.28})` }} />
        </div>
        <div
          ref={rowRef}
          role="button"
          tabIndex={0}
          aria-current={selected ? "true" : undefined}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            onSelect(thread.id);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onSelect(thread.id);
          }}
          className={cn(
            "relative flex w-full flex-col gap-0.5 bg-background px-5 py-2.5 text-left hover:bg-muted/50",
            selected && "bg-accent hover:bg-accent",
          )}
          style={{
            transform: `translate3d(${offset}px, 0, 0)`,
            transition: dragging ? "none" : `transform 320ms ${swipeEase}`,
          }}
        >
          <span className="flex items-center gap-2">
            {thread.unread ? <span className="size-2 shrink-0 rounded-full bg-lavender" /> : null}
            <span className={cn("min-w-0 flex-1 truncate text-base", thread.unread ? "font-semibold" : "font-medium")}>
              {threadSender(thread, ownEmails)}
            </span>
            {thread.starred ? <Star className="size-3 shrink-0 fill-current text-lavender" /> : null}
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatThreadTime(thread.lastMessageAt)}
            </span>
          </span>
          <span className={cn("truncate text-[13px]", thread.unread ? "font-medium" : "text-foreground/80")}>
            {displaySubject(thread.subject)}
            {thread.messageCount > 1 ? (
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">{thread.messageCount}</span>
            ) : null}
          </span>
          <span className="truncate text-[12px] text-muted-foreground">{thread.snippet || "No preview"}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onAction(thread.id, "star")}>
          <Star className={cn(thread.starred && "fill-current text-lavender")} />
          {thread.starred ? "Unstar" : "Star"}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAction(thread.id, "unread")}>
          <Mail />
          {thread.unread ? "Mark as read" : "Mark as unread"}
        </ContextMenuItem>
        {allowArchive ? (
          <ContextMenuItem onClick={() => onAction(thread.id, "archive")}>
            <Archive />
            Archive
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onAction(thread.id, "trash")}>
          <Trash2 />
          {folder === "trash" ? "Delete forever" : "Trash"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
