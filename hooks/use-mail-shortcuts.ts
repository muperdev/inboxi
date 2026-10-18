"use client";

import { useEffect, useRef } from "react";

type ShortcutHandlers = {
  onCompose: () => void;
  onSearch: () => void;
  onMove: (delta: number) => void;
  onArchive: () => void;
  onTrash: () => void;
  onStar: () => void;
  onUnread: () => void;
  onReply: () => void;
  onBack: () => void;
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function dialogOpen(): boolean {
  return document.querySelector("[data-slot='dialog-content'], [data-slot='sheet-content']") !== null;
}

export function useMailShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || dialogOpen()) return;

      const key = event.key;
      const lower = key.toLowerCase();
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };

      if (lower === "c") return run(handlersRef.current.onCompose);
      if (key === "/") return run(handlersRef.current.onSearch);
      if (lower === "j" || key === "ArrowDown") return run(() => handlersRef.current.onMove(1));
      if (lower === "k" || key === "ArrowUp") return run(() => handlersRef.current.onMove(-1));
      if (lower === "e") return run(handlersRef.current.onArchive);
      if (key === "#") return run(handlersRef.current.onTrash);
      if (lower === "s") return run(handlersRef.current.onStar);
      if (lower === "u") return run(handlersRef.current.onUnread);
      if (lower === "r") return run(handlersRef.current.onReply);
      if (key === "Escape") return run(handlersRef.current.onBack);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
