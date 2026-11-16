import OpenAI from "openai";
import { callModel, type ChatMessage, type LLMResult } from "./callModel.js";
import { MODELS, type ModelId } from "../config/models.js";
import type { ProviderName } from "../config/providers.js";

// If a model fails, which models do we try next? (in order, different companies)
export const FALLBACK_CHAIN: Record<ModelId, ModelId[]> = {
  "groq-cheap": ["openrouter-free", "gemini-premium"],
  "gemini-premium": ["groq-cheap", "openrouter-free"],
  "openrouter-free": ["groq-cheap", "gemini-premium"],
};

const MAX_RETRIES_SAME_MODEL = 1;

export type Attempt = {
  modelId: ModelId;
  ok: boolean;
  error?: string;
  latencyMs: number;
};

export type ReliableResult = {
  result: LLMResult;
  attempts: Attempt[];
  usedFallback: boolean;
};

export class AllProvidersFailedError extends Error {
  attempts: Attempt[];
  constructor(attempts: Attempt[]) {
    super("All providers failed");
    this.attempts = attempts;
  }
}

// A fake outage, used only for testing (behaves like a 503).
class SimulatedOutage extends Error {}

type NextStep = "retry_same" | "try_next";

// Decide: is this error worth retrying on the SAME model?
function classify(err: unknown): NextStep {
  if (err instanceof SimulatedOutage) return "retry_same";
  if (err instanceof OpenAI.APIConnectionTimeoutError) return "try_next"; // slow → move on
  if (err instanceof OpenAI.APIConnectionError) return "retry_same"; // network blip
  if (err instanceof OpenAI.APIError && (err.status ?? 0) >= 500)
    return "retry_same"; // server hiccup
  return "try_next"; // 429, 400, 401, 404, ...
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff with jitter: ~300 ms, then ~600 ms... plus a random bit
function backoffMs(retry: number): number {
  return 300 * 2 ** retry + Math.random() * 200;
}

export async function reliableCall(
  primary: ModelId,
  messages: ChatMessage[],
  opts: {
    maxTokens?: number;
    simulateOutage?: ProviderName;
    noFallback?: boolean;
  } = {},
): Promise<ReliableResult> {
  const chain = opts.noFallback
    ? [primary]
    : [primary, ...FALLBACK_CHAIN[primary]];
  const attempts: Attempt[] = [];

  for (const modelId of chain) {
    for (let retry = 0; retry <= MAX_RETRIES_SAME_MODEL; retry++) {
      const start = Date.now();
      try {
        if (opts.simulateOutage === MODELS[modelId].provider) {
          throw new SimulatedOutage("simulated outage (test)");
        }
        const result = await callModel(modelId, messages, opts.maxTokens);
        attempts.push({ modelId, ok: true, latencyMs: Date.now() - start });
        return { result, attempts, usedFallback: modelId !== primary };
      } catch (err) {
        const message = (err as Error).message;
        // Decide the REAL next action first, then log it
        const willRetry =
          classify(err) === "retry_same" && retry < MAX_RETRIES_SAME_MODEL;
        attempts.push({
          modelId,
          ok: false,
          error: message,
          latencyMs: Date.now() - start,
        });
        console.log(
          `[reliable] ${modelId} failed: ${message} -> ${willRetry ? "retrying same model" : "trying next model"}`,
        );

        if (willRetry) {
          await sleep(backoffMs(retry));
          continue;
        }
        break;
      }
    }
  }

  throw new AllProvidersFailedError(attempts);
}
