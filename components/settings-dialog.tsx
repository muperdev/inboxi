"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
          toast.error("Use an OpenRouter model id, like z-ai/glm-5.3-flash.");
          return;
        }
        save.mutate({
          model: nextModel,
          ...(apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
        });
      }}
    >
      <div className="grid gap-3">
        <Label htmlFor="openrouter-key">OpenRouter API key</Label>
        <div className="grid gap-1.5">
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
      </div>
      <div className="grid gap-3">
        <Label htmlFor="openrouter-model">Model</Label>
        <DropdownMenu>
          <DropdownMenuTrigger
            id="openrouter-model"
            className="flex h-10 w-full items-center justify-between gap-3 rounded-sm border border-input bg-card pr-3 pl-3 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <span className="min-w-0 flex-1 truncate">
              {custom ? "Custom model" : assistantModels.find((item) => item.id === model)?.label}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {assistantModels.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => {
                  setCustom(false);
                  setModel(item.id);
                }}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              onClick={() => {
                setCustom(true);
                setModel("");
              }}
            >
              Custom model id
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
