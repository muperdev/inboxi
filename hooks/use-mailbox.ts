"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { mailApi, mailApiOrigin } from "@/lib/mail-api";
import type {
  MailFolder,
  ThreadAction,
  ThreadDetail,
  ThreadFilter,
  ThreadSummary,
} from "@/lib/mail-types";

export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => mailApi.bootstrap(),
  });
}

export function useThreads(filter: ThreadFilter) {
  return useQuery({
    queryKey: ["threads", filter],
    queryFn: () => mailApi.threads(filter),
  });
}

export function useThread(threadId: string | null) {
  return useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => mailApi.thread(threadId ?? ""),
    enabled: Boolean(threadId),
  });
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => mailApi.search(query),
    enabled: query.trim().length > 1,
  });
}

type ActionInput = {
  threadId: string;
  action: ThreadAction;
  folder: MailFolder;
};

function patchThread(thread: ThreadSummary, action: ThreadAction): ThreadSummary | null {
  if (action === "read") return { ...thread, unread: false };
  if (action === "unread") return { ...thread, unread: true };
  if (action === "star") return { ...thread, starred: true };
  if (action === "unstar") return { ...thread, starred: false };
  return thread;
}

export function useThreadAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActionInput) => mailApi.act(input.threadId, input.action),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["threads"] });
      const previousLists = queryClient.getQueriesData<ThreadSummary[]>({
        queryKey: ["threads"],
      });
      const previousThread = queryClient.getQueryData(["thread", input.threadId]);

      queryClient.setQueriesData<ThreadSummary[]>({ queryKey: ["threads"] }, (current) => {
        if (!current) return current;
        return current.flatMap((thread) => {
          if (thread.id !== input.threadId) return [thread];
          if (input.action === "archive" && input.folder !== "archive") return [];
          if (input.action === "trash" && input.folder !== "trash") return [];
          if (input.action === "delete") return [];
          const next = patchThread(thread, input.action);
          return next ? [next] : [];
        });
      });

      queryClient.setQueryData<ThreadDetail>(["thread", input.threadId], (current) => {
        if (!current) return current;
        const unread =
          input.action === "unread" ? true : input.action === "read" ? false : current.unread;
        const starred =
          input.action === "star" ? true : input.action === "unstar" ? false : current.starred;
        return {
          ...current,
          unread,
          starred,
          messages: current.messages.map((message) => ({
            ...message,
            unread: input.action === "read" || input.action === "unread" ? unread : message.unread,
            starred:
              input.action === "star" || input.action === "unstar" ? starred : message.starred,
          })),
        };
      });

      return { previousLists, previousThread, threadId: input.threadId };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.previousLists ?? []) {
        queryClient.setQueryData(key, data);
      }
      if (context) queryClient.setQueryData(["thread", context.threadId], context.previousThread);
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["thread", input.threadId] });
    },
  });
}

export function useMailEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource(`${mailApiOrigin()}/events`);
    source.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ["threads"] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["thread"] });
    };
    return () => source.close();
  }, [queryClient]);
}
