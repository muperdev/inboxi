"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, ArrowLeft, Mail, Reply, Star, Trash2 } from "lucide-react";
import { MessageBody, attachmentHref } from "@/components/message-body";
import { RewriteDraft } from "@/components/rewrite-draft";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  displaySubject,
  formatFileSize,
  formatMessageTime,
  initials,
  isEmail,
  normalizeEmail,
  recipientLine,
} from "@/lib/format";
import { mailApi } from "@/lib/mail-api";
import type { Folder, Identity, MailFolder, MailMessage, ThreadDetail } from "@/lib/mail-types";
import { cn } from "cn";

type ReadingPaneProps = {
  thread: ThreadDetail | undefined;
  loading: boolean;
  folder: MailFolder;
  folders: Folder[];
  identities: Identity[];
  ownEmails: ReadonlySet<string>;
  replySignal: number;
  onRead: () => void;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onStar: () => void;
  onUnread: () => void;
};

export function ReadingPane({
  thread,
  loading,
  folder,
  folders,
  identities,
  ownEmails,
  replySignal,
  onRead,
  onBack,
  onArchive,
  onTrash,
  onStar,
  onUnread,
}: ReadingPaneProps) {
  const canArchive = thread
    ? folders.some((item) => item.accountId === thread.accountId && item.role === "archive")
    : false;
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!thread?.unread || seen.current.has(thread.id)) return;
    seen.current.add(thread.id);
    onRead();
  }, [thread, onRead]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {thread ? (
        <>
          <header className="flex items-start gap-3 px-5 pt-6 pb-4 md:px-10">
            <Button variant="ghost" size="icon-sm" className="mt-1 lg:hidden" aria-label="Back" onClick={onBack}>
              <ArrowLeft />
            </Button>
            <h2 className="min-w-0 flex-1 font-display text-[26px] leading-[1.12] font-normal tracking-[-0.03em] md:text-[30px]">
              {displaySubject(thread.subject)}
            </h2>
            <div className="flex shrink-0 items-center">
              <IconButton label={thread.starred ? "Unstar" : "Star"} onClick={onStar}>
                <Star className={cn(thread.starred && "fill-current text-lavender")} />
              </IconButton>
              {canArchive ? (
                <IconButton label="Archive" shortcut="E" onClick={onArchive}>
                  <Archive />
                </IconButton>
              ) : null}
              <IconButton label={folder === "trash" ? "Delete forever" : "Trash"} shortcut="#" onClick={onTrash}>
                <Trash2 />
              </IconButton>
              <IconButton label={thread.unread ? "Mark as read" : "Mark as unread"} shortcut="U" onClick={onUnread}>
                <Mail />
              </IconButton>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col px-5 pb-10 md:px-10">
              {thread.messages.map((message, index) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  collapsed={index < thread.messages.length - 1}
                />
              ))}
              <ReplyBox
                thread={thread}
                identities={identities}
                ownEmails={ownEmails}
                replySignal={replySignal}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          {loading ? (
            <p className="text-sm text-muted-foreground">Opening…</p>
          ) : (
            <div>
              <p className="font-display text-[32px] leading-[1.05] font-normal tracking-[-0.03em]">
                Nothing open.
                <em className="mt-1 block font-light italic">Pick a conversation.</em>
              </p>
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                J and K move · E archives · R replies
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function IconButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-2 text-background/70">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function MessageCard({ message, collapsed }: { message: MailMessage; collapsed: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  useEffect(() => {
    setOpen(!collapsed);
  }, [collapsed, message.id]);

  const visibleAttachments = message.attachments.filter(
    (attachment) => attachment.filename && attachment.filename !== "attachment",
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-baseline gap-3 border-b py-3 text-left"
      >
        <span className="w-28 shrink-0 truncate text-sm font-medium">
          {message.from.name || message.from.email || "Unknown"}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {message.snippet || "Empty message"}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatMessageTime(message.date)}
        </span>
      </button>
    );
  }

  return (
    <article className="border-b py-5">
      <header className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-lavender"
          aria-hidden
        >
          {initials(message.from.name, message.from.email)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium">
              {message.from.name || message.from.email || "Unknown"}
              {message.from.name && message.from.email ? (
                <span className="ml-2 font-normal text-muted-foreground">{message.from.email}</span>
              ) : null}
            </p>
            <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={new Date(message.date).toISOString()}>
              {formatMessageTime(message.date)}
            </time>
          </div>
          <p className="truncate text-xs text-muted-foreground">{recipientLine("To", message.to)}</p>
          {message.cc.length > 0 ? (
            <p className="truncate text-xs text-muted-foreground">{recipientLine("Cc", message.cc)}</p>
          ) : null}
        </div>
      </header>
      <div className="pt-4 pl-11">
        <MessageBody html={message.bodyHtml} text={message.bodyText} />
        {visibleAttachments.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {visibleAttachments.map((attachment) => (
              <li key={attachment.index}>
                <a
                  href={attachmentHref(message.id, attachment.index)}
                  className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <span className="max-w-48 truncate">{attachment.filename}</span>
                  <span className="text-muted-foreground">{formatFileSize(attachment.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

function ReplyBox({
  thread,
  identities,
  ownEmails,
  replySignal,
}: {
  thread: ThreadDetail;
  identities: Identity[];
  ownEmails: ReadonlySet<string>;
  replySignal: number;
}) {
  const latest = thread.messages[thread.messages.length - 1];
  const [open, setOpen] = useState(false);
  const [replyAll, setReplyAll] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const accountIdentities = identities.filter((identity) => identity.accountId === thread.accountId);
  const matched = latest
    ? accountIdentities.find((identity) =>
        [...(latest.to ?? []), ...(latest.cc ?? [])].some(
          (address) => address.email === identity.email,
        ),
      )
    : undefined;
  const identity = matched ?? accountIdentities.find((item) => item.isPrimary) ?? accountIdentities[0];

  useEffect(() => {
    if (replySignal === 0) return;
    setReplyAll(false);
    setOpen(true);
    requestAnimationFrame(() => areaRef.current?.focus());
  }, [replySignal]);

  if (!latest || !identity) return null;

  const replyTo = replyAll
    ? uniqueEmails(
        [latest.from.email, ...latest.to.map((address) => address.email)].filter(
          (email) => email && !ownEmails.has(email),
        ),
      )
    : latest.from.email
      ? [latest.from.email]
      : [];
  const replyCc = replyAll
    ? uniqueEmails(latest.cc.map((address) => address.email)).filter(
        (email) => !ownEmails.has(email) && !replyTo.includes(email),
      )
    : [];
  const extraRecipients = [...latest.to, ...latest.cc].filter(
    (address) => address.email && !ownEmails.has(address.email) && address.email !== latest.from.email,
  );

  return (
    <div className="py-5">
      {open ? (
        <form
          className="rounded-2xl border bg-card p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!text.trim()) return;
            setSending(true);
            try {
              await mailApi.send({
                accountId: thread.accountId,
                identityId: identity.id,
                to: replyTo,
                cc: replyCc,
                bcc: [],
                subject: thread.subject,
                text,
                replyToMessageId: latest.id,
              });
              setText("");
              setOpen(false);
              toast.success("Sent");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not send.");
            } finally {
              setSending(false);
            }
          }}
        >
          <p className="px-1 pb-2 text-xs text-muted-foreground">
            {identity.email} to {replyTo.join(", ") || "…"}
          </p>
          <Textarea
            ref={areaRef}
            data-reply="true"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Reply…"
            className="min-h-28 border-0 shadow-none focus-visible:ring-0"
            required
          />
          <div className="pt-2">
            <RewriteDraft text={text} subject={thread.subject} onChange={setText} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Discard
            </Button>
            <Button type="submit" disabled={sending || !isEmail(normalizeEmail(latest.from.email))}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setReplyAll(false);
              setOpen(true);
            }}
          >
            <Reply />
            Reply
          </Button>
          {extraRecipients.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setReplyAll(true);
                setOpen(true);
              }}
            >
              Reply all
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of emails) {
    if (!email || seen.has(email) || !isEmail(email)) continue;
    seen.add(email);
    result.push(email);
  }
  return result;
}
