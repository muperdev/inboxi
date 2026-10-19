"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { mailApi } from "@/lib/mail-api";

const polishInstruction =
  "Polish this as it is. Keep the meaning, names, and facts. Make the wording clear and natural.";

export function RewriteDraft({
  text,
  subject,
  context = "",
  promptSignal = 0,
  onChange,
}: {
  text: string;
  subject: string;
  context?: string;
  promptSignal?: number;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const hasDraft = text.trim().length > 0;

  useEffect(() => {
    if (promptSignal === 0) return;
    setOpen(true);
  }, [promptSignal]);

  const write = (nextInstruction: string) => {
    if (!nextInstruction || pending) return;
    setPending(true);
    void mailApi
      .rewrite({ instruction: nextInstruction, text, subject, context })
      .then((result) => {
        onChange(result.text);
        setInstruction("");
        setOpen(false);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not write that.");
      })
      .finally(() => setPending(false));
  };

  if (!open) {
    return (
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[13px] text-lavender hover:text-foreground"
          onClick={() => setOpen(true)}
        >
          <Sparkles className="size-3.5" />
          Write with AI
        </button>
        {hasDraft ? (
          <button
            type="button"
            className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={pending}
            onClick={() => write(polishInstruction)}
          >
            {pending ? "Polishing…" : "Polish"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-sm bg-muted/70 px-3">
      <Sparkles className="size-3.5 shrink-0 text-lavender" />
      <input
        autoFocus
        value={instruction}
        disabled={pending}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          write(instruction.trim());
        }}
        placeholder={hasDraft ? "How should this change?" : "What should this say?"}
        aria-label="What the message should say"
        className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        className="text-[13px] text-lavender disabled:opacity-50"
        disabled={pending || instruction.trim().length === 0}
        onClick={() => write(instruction.trim())}
      >
        {pending ? "Writing…" : "Write"}
      </button>
    </div>
  );
}
