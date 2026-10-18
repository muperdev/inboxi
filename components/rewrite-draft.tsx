"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mailApi } from "@/lib/mail-api";

export function RewriteDraft({
  text,
  subject,
  onChange,
}: {
  text: string;
  subject: string;
  onChange: (next: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Input
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Shorter, warmer, fix the tone…"
        aria-label="How to rewrite this draft"
        className="h-9"
      />
      <Button
        type="button"
        variant="outline"
        disabled={pending || instruction.trim().length === 0 || text.trim().length === 0}
        onClick={() => {
          setPending(true);
          void mailApi
            .rewrite({ instruction: instruction.trim(), text, subject })
            .then((result) => {
              onChange(result.text);
              setInstruction("");
            })
            .catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : "Could not rewrite that.");
            })
            .finally(() => setPending(false));
        }}
      >
        {pending ? "Rewriting…" : "Rewrite"}
      </Button>
    </div>
  );
}
