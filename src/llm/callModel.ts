import type OpenAI from "openai";
import { getClient } from "../config/providers.js";
import { MODELS, type ModelId } from "../config/models.js";

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type LLMResult = {
  output: string;
  modelId: ModelId;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  finishReason: string;
};

export async function callModel(
  modelId: ModelId,
  messages: ChatMessage[],
  maxOutputTokens = 1000,
): Promise<LLMResult> {
  const info = MODELS[modelId];
  const client = getClient(info.provider);

  const start = Date.now();
  const response = await client.chat.completions.create(
    {
      model: info.model,
      messages,
      max_tokens: maxOutputTokens,
      reasoning_effort: info.reasoningEffort,
    },
    { timeout: info.timeoutMs }, // per-model timeout (overrides the client default)
  );
  const latencyMs = Date.now() - start;

  const usage = response.usage;
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = Math.max(
    usage?.completion_tokens ?? 0,
    (usage?.total_tokens ?? 0) - inputTokens,
  );

  const costUsd =
    (inputTokens / 1_000_000) * info.inputPricePer1M +
    (outputTokens / 1_000_000) * info.outputPricePer1M;

  return {
    output: response.choices[0]?.message?.content ?? "",
    modelId,
    provider: info.provider,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
    finishReason: response.choices[0]?.finish_reason ?? "unknown",
  };
}
