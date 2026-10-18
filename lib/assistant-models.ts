export const defaultAssistantModel = "openai/gpt-4.1-mini";

export const assistantModels: ReadonlyArray<{ id: string; label: string }> = [
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet" },
  { id: "google/gemini-2.5-flash", label: "Gemini Flash" },
];

const modelPattern = /^[a-z0-9][a-z0-9._:/-]{1,80}$/i;

export function isAssistantModel(value: string): boolean {
  return modelPattern.test(value);
}
