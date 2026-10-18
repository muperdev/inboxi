export const defaultAssistantModel = "z-ai/glm-5.3-flash";

export const assistantModels: ReadonlyArray<{ id: string; label: string }> = [
  { id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna" },
];

const retiredModels = new Set([
  "openai/gpt-4.1-mini",
  "anthropic/claude-sonnet-4.5",
  "google/gemini-2.5-flash",
]);

const modelPattern = /^[a-z0-9][a-z0-9._:/-]{1,80}$/i;

export function isAssistantModel(value: string): boolean {
  return modelPattern.test(value) && !retiredModels.has(value);
}
