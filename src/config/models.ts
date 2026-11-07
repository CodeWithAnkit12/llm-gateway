import type { ProviderName } from "./providers.js";

export type Tier = "cheap" | "premium" | "fallback";

export type ModelId = "groq-cheap" | "gemini-premium" | "openrouter-free";

export type ModelInfo = {
  provider: ProviderName;
  model: string;
  tier: Tier;
  inputPricePer1M: number;
  outputPricePer1M: number;
  reasoningEffort?: "low" | "medium" | "high";
  timeoutMs: number; // NEW: each model gets its own patience limit
};

// Prices checked on 7 Nov 2026. Timeouts based on our measured latency.
export const MODELS: Record<ModelId, ModelInfo> = {
  "groq-cheap": {
    provider: "groq",
    model: "openai/gpt-oss-20b",
    tier: "cheap",
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    reasoningEffort: "low",
    timeoutMs: 10_000, // usually answers in ~1 s
  },
  "gemini-premium": {
    provider: "gemini",
    model: "gemini-3.6-flash",
    tier: "premium",
    inputPricePer1M: 0.75,
    outputPricePer1M: 3.75,
    reasoningEffort: "low",
    timeoutMs: 25_000, // slowest we saw was ~6 s; thinking takes time
  },
  "openrouter-free": {
    provider: "openrouter",
    model: "google/gemma-4-26b-a4b-it:free",
    tier: "fallback",
    inputPricePer1M: 0.068,
    outputPricePer1M: 0.225,
    timeoutMs: 15_000,
  },
};
