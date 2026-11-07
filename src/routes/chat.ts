import { Router } from "express";
import { z } from "zod";
import { callModel, type ChatMessage } from "../llm/callModel.js";
import { reliableCall, AllProvidersFailedError } from "../llm/reliableCall.js";
import { MODELS, type ModelId } from "../config/models.js";
import { route, needsEscalation } from "../router/router.js";

export const chatRouter = Router();

const modelIds = Object.keys(MODELS) as [ModelId, ...ModelId[]];
const modelChoices = ["auto", ...modelIds] as ["auto", ...ModelId[]];

const ChatRequestSchema = z.object({
  model: z.enum(modelChoices).default("auto"),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
  max_tokens: z.number().int().positive().max(4000).optional(),
});

const HeadersSchema = z.object({
  "x-task-type": z
    .enum(["chat", "summarize", "extract", "code", "reasoning"])
    .optional(),
  "x-priority": z.enum(["low", "normal", "high"]).default("normal"),
  "x-simulate-outage": z.enum(["groq", "gemini", "openrouter"]).optional(), // testing only
});

chatRouter.post("/v1/chat/completions", async (req, res) => {
  const start = Date.now();

  const body = ChatRequestSchema.safeParse(req.body);
  if (!body.success) {
    res
      .status(400)
      .json({
        error: { message: "Invalid request", details: body.error.issues },
      });
    return;
  }
  const headers = HeadersSchema.safeParse(req.headers);
  if (!headers.success) {
    res
      .status(400)
      .json({
        error: { message: "Invalid headers", details: headers.error.issues },
      });
    return;
  }

  const { model, max_tokens } = body.data;
  const messages = body.data.messages as ChatMessage[];

  // Never let real users trigger fake outages in production
  const simulateOutage =
    process.env.NODE_ENV === "production"
      ? undefined
      : headers.data["x-simulate-outage"];

  const decision = route({
    requestedModel: model,
    messages,
    taskType: headers.data["x-task-type"],
    priority: headers.data["x-priority"],
  });

  try {
    // 1. Call with retries + fallback
    const rel = await reliableCall(decision.modelId, messages, {
      maxTokens: max_tokens,
      simulateOutage,
    });
    let r = rel.result;
    let totalCostUsd = r.costUsd;
    let reason = decision.reason;
    let escalated = false;

    if (rel.usedFallback) reason += ` → fallback to ${r.modelId}`;

    // 2. Safety net: non-premium answer looks broken → try premium once
    if (
      model === "auto" &&
      MODELS[r.modelId].tier !== "premium" &&
      needsEscalation(r)
    ) {
      try {
        const better = await callModel("gemini-premium", messages, max_tokens);
        totalCostUsd += better.costUsd;
        r = better;
        escalated = true;
        reason += " → escalated: cheap answer was cut off or empty";
      } catch (err) {
        // Graceful degradation: a cut-off answer is better than an error
        console.log(
          "[router] escalation failed, keeping cheap answer:",
          (err as Error).message,
        );
      }
    }

    console.log(`[router] ${r.modelId} | ${reason}`);

    res.json({
      id: `gw-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: r.modelId,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: r.output },
          finish_reason: r.finishReason,
        },
      ],
      usage: {
        prompt_tokens: r.inputTokens,
        completion_tokens: r.outputTokens,
        total_tokens: r.inputTokens + r.outputTokens,
      },
      gateway: {
        provider: r.provider,
        tier: MODELS[r.modelId].tier,
        route_reason: reason,
        escalated,
        used_fallback: rel.usedFallback,
        attempts: rel.attempts,
        cost_usd: Number(totalCostUsd.toFixed(10)),
        latency_ms: Date.now() - start,
      },
    });
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      console.error("[chat] all providers failed:", err.attempts);
      res.status(502).json({
        error: {
          message: "All AI providers failed. Please try again later.",
          attempts: err.attempts.map((a) => ({
            model: a.modelId,
            error: a.error,
          })),
        },
      });
      return;
    }
    console.error("[chat] unexpected error:", err);
    res.status(500).json({ error: { message: "Internal gateway error" } });
  }
});
