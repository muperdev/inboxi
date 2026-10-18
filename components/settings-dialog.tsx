"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assistantModels, defaultAssistantModel, isAssistantModel } from "@/lib/assistant-models";
import { mailApi } from "@/lib/mail-api";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: mailApi.settings,
    enabled: open,
  });
  const initialModel = settings.data?.model ?? defaultAssistantModel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            The OpenRouter key stays on this Mac. It is never written into the app or the repository.
          </DialogDescription>
        </DialogHeader>
        {open && !settings.isPending ? (
          <SettingsForm
            key={initialModel}
            initialModel={initialModel}
            configured={settings.data?.configured ?? false}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({
  initialModel,
  configured,
  onClose,
}: {
  initialModel: string;
  configured: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initialModel);
  const [custom, setCustom] = useState(
    !assistantModels.some((item) => item.id === initialModel),
  );

  const save = useMutation({
    mutationFn: mailApi.saveSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
      setApiKey("");
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    },
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const nextModel = model.trim();
        if (!isAssistantModel(nextModel)) {
          toast.error("Use an OpenRouter model id, like openai/gpt-4.1-mini.");
          return;
        }
        save.mutate({
          model: nextModel,
          ...(apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="openrouter-key">OpenRouter API key</Label>
        <Input
          id="openrouter-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={configured ? "Saved on this Mac" : "sk-or-…"}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Create one at openrouter.ai. Leave this blank to keep the saved key.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="openrouter-model">Model</Label>
        <select
          id="openrouter-model"
          value={custom ? "custom" : model}
          onChange={(event) => {
            if (event.target.value === "custom") {
              setCustom(true);
              setModel("");
              return;
            }
            setCustom(false);
            setModel(event.target.value);
          }}
          className="h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          {assistantModels.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
          <option value="custom">Custom model id</option>
        </select>
        {custom ? (
          <Input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="provider/model"
            aria-label="Custom OpenRouter model"
          />
        ) : null}
      </div>
      <DialogFooter>
        {configured ? (
          <Button
            type="button"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate({ apiKey: "" })}
          >
            Remove key
          </Button>
        ) : null}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
