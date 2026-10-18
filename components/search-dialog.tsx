"use client";

import { useDeferredValue, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { displaySubject, formatThreadTime, threadSender } from "@/lib/format";
import type { ThreadSummary } from "@/lib/mail-types";
import { useSearch } from "@/hooks/use-mailbox";

type SearchDialogProps = {
  open: boolean;
  ownEmails: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onSelect: (threadId: string) => void;
};

export function SearchDialog({ open, ownEmails, onOpenChange, onSelect }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim());
  const results = useSearch(deferred);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search mail"
      description="Search subjects and messages"
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search mail"
          autoFocus
        />
        <CommandList>
          {deferred.length > 1 && results.data?.length === 0 ? (
            <CommandEmpty>No messages found.</CommandEmpty>
          ) : null}
          <CommandGroup>
            {(results.data ?? []).map((thread) => (
              <SearchHit
                key={thread.id}
                thread={thread}
                ownEmails={ownEmails}
                onSelect={() => {
                  onSelect(thread.id);
                  onOpenChange(false);
                  setQuery("");
                }}
              />
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function SearchHit({
  thread,
  ownEmails,
  onSelect,
}: {
  thread: ThreadSummary;
  ownEmails: ReadonlySet<string>;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={thread.id} onSelect={onSelect}>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm">{threadSender(thread, ownEmails)}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatThreadTime(thread.lastMessageAt)}
          </span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {displaySubject(thread.subject)}
        </span>
      </span>
    </CommandItem>
  );
}
