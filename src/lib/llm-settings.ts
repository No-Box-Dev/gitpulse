import { apiGet, apiPut } from "./api";

export type AiMode = "managed" | "disabled";
export type LlmSettings = {
  mode: AiMode;
  managed: { provider: "anthropic"; model: string; available: boolean };
};

export const fetchLlmSettings = () => apiGet<LlmSettings>("/api/llm-settings");
export const setAiMode = (mode: AiMode) =>
  apiPut<LlmSettings>("/api/llm-settings", { mode });
