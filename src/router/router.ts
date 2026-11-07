import type { ModelId } from "../config/models.js";
import type { ChatMessage, LLMResult } from "../llm/callModel.js";

export type TaskType = "chat" | "summarize" | "extract" | "code" | "reasoning";
export type Priority = "low" | "normal" | "high";

export type RouteInput = {
  requestedModel: ModelId | "auto";
  messages: ChatMessage[];
  taskType?: TaskType;
  priority: Priority;
};

export type RouteDecision = {
  modelId: ModelId;
  reason: string; // WHY we chose it, for debugging and the dashboard
};

const LONG_INPUT_TOKENS = 3000;
const HARD_TASKS: TaskType[] = ["code", "reasoning"];

// Rough rule: 1 token ≈ 4 characters of English text.
// Not exact, but good enough to make a routing decision.
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") chars += m.content.length;
  }
  return Math.ceil(chars / 4);
}

function allText(messages: ChatMessage[]): string {
  return messages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");
}

export function route(input: RouteInput): RouteDecision {
  // Rule 1: client chose a model → respect it
  if (input.requestedModel !== "auto") {
    return {
      modelId: input.requestedModel,
      reason: "client asked for this model",
    };
  }

  // Rule 2: important request → best model
  if (input.priority === "high") {
    return { modelId: "gemini-premium", reason: "high priority" };
  }

  // Rule 3: hard task type
  if (input.taskType && HARD_TASKS.includes(input.taskType)) {
    return {
      modelId: "gemini-premium",
      reason: `hard task: ${input.taskType}`,
    };
  }

  // Rule 4: long input
  const tokens = estimateTokens(input.messages);
  if (tokens > LONG_INPUT_TOKENS) {
    return {
      modelId: "gemini-premium",
      reason: `long input (~${tokens} tokens)`,
    };
  }

  // Rule 5: message contains a code block
  if (allText(input.messages).includes("```")) {
    return { modelId: "gemini-premium", reason: "message contains code" };
  }

  // Rule 6: default → cheap
  return { modelId: "groq-cheap", reason: "default: simple request" };
}

// Safety net: does the cheap answer look broken?
export function needsEscalation(r: LLMResult): boolean {
  return r.output.trim() === "" || r.finishReason === "length";
}
