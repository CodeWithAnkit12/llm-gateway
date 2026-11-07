import type { ProviderName } from "./providers.js";

export type Tier = "cheap" | "premium" | "fallback";

// LOGICAL names: our code uses these. They never change,
// even when a provider renames or removes a model.
export type ModelId = "groq-cheap" | "gemini-premium" | "openrouter-free";

export type ModelInfo = {
  provider: ProviderName;
  model: string; // exact name the provider expects (this CAN change)
  tier: Tier;
  inputPricePer1M: number; // USD, published PAID price (for shadow cost)
  outputPricePer1M: number; // USD
  reasoningEffort?: "low" | "medium" | "high";
};

// Prices checked on 7 Nov 2026. When prices change, update THIS table.
export const MODELS: Record<ModelId, ModelInfo> = {
  "groq-cheap": {
    provider: "groq",
    model: "openai/gpt-oss-20b",
    tier: "cheap",
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    reasoningEffort: "low",
  },
  "gemini-premium": {
    provider: "gemini",
    model: "gemini-3.6-flash", // 3.8 timed out in our tests on 7 Nov 2026
    tier: "premium",
    inputPricePer1M: 0.75, // intro price; becomes $1.50 on 1 Jan 2027
    outputPricePer1M: 3.75, // becomes $7.50 on 1 Jan 2027
    reasoningEffort: "low",
  },
  "openrouter-free": {
    provider: "openrouter",
    model: "google/gemma-4-26b-a4b-it:free", // free models rotate, check monthly
    tier: "fallback",
    inputPricePer1M: 0.068, // price of the PAID version, for shadow cost
    outputPricePer1M: 0.225,
  },
};
