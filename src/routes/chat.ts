import { Router } from "express";
import { z } from "zod";
import {
  callModel,
  type ChatMessage,
  type LLMResult,
} from "../llm/callModel.js";
import {
  reliableCall,
  AllProvidersFailedError,
  type Attempt,
} from "../llm/reliableCall.js";
import { MODELS, type ModelId } from "../config/models.js";
import type { Tenant } from "../config/tenants.js";
import { route, needsEscalation } from "../router/router.js";
import { makeCacheKey, getCached, setCached } from "../cache/responseCache.js";

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
  "x-simulate-outage": z.enum(["groq", "gemini", "openrouter"]).optional(),
  "x-cache": z.enum(["bypass"]).optional(), // NEW: skip the cache
});

type GatewayMeta = {
  tenantId: string;
  reason: string;
  cache: "hit" | "miss" | "bypass";
  escalated: boolean;
  usedFallback: boolean;
  attempts: Attempt[];
  costUsd: number; // what THIS request cost
  savedUsd: number; // what the cache saved us
  latencyMs: number;
};

// Build the OpenAI-style response in ONE place
function toOpenAIResponse(r: LLMResult, meta: GatewayMeta) {
  return {
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
      tenant: meta.tenantId,
      provider: r.provider,
      tier: MODELS[r.modelId].tier,
      route_reason: meta.reason,
      cache: meta.cache,
      escalated: meta.escalated,
      used_fallback: meta.usedFallback,
      attempts: meta.attempts,
      cost_usd: Number(meta.costUsd.toFixed(10)),
      saved_usd: Number(meta.savedUsd.toFixed(10)),
      latency_ms: meta.latencyMs,
    },
  };
}

chatRouter.post("/v1/chat/completions", async (req, res) => {
  const start = Date.now();
  const tenant = res.locals.tenant as Tenant; // set by the auth middleware

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
  const bypassCache = headers.data["x-cache"] === "bypass";
  const simulateOutage =
    process.env.NODE_ENV === "production"
      ? undefined
      : headers.data["x-simulate-outage"];

  // 1. Route (fast, no network)
  const decision = route({
    requestedModel: model,
    messages,
    taskType: headers.data["x-task-type"],
    priority: headers.data["x-priority"],
  });

  // 2. Cache lookup
  const cacheKey = makeCacheKey(
    tenant.id,
    decision.modelId,
    messages,
    max_tokens,
  );
  if (!bypassCache) {
    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(
        `[cache] HIT  tenant=${tenant.id} model=${hit.result.modelId}`,
      );
      res.json(
        toOpenAIResponse(hit.result, {
          tenantId: tenant.id,
          reason: `${decision.reason} → cache hit`,
          cache: "hit",
          escalated: false,
          usedFallback: false,
          attempts: [],
          costUsd: 0, // no AI call!
          savedUsd: hit.result.costUsd, // what we would have paid
          latencyMs: Date.now() - start,
        }),
      );
      return;
    }
  }

  try {
    // 3. Call the AI (retries + fallback)
    const rel = await reliableCall(decision.modelId, messages, {
      maxTokens: max_tokens,
      simulateOutage,
    });
    let r = rel.result;
    let totalCostUsd = r.costUsd;
    let reason = decision.reason;
    let escalated = false;

    if (rel.usedFallback) reason += ` → fallback to ${r.modelId}`;

    // 4. Safety net: escalate broken non-premium answers
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
        console.log(
          "[router] escalation failed, keeping cheap answer:",
          (err as Error).message,
        );
      }
    }

    console.log(`[router] tenant=${tenant.id} ${r.modelId} | ${reason}`);

    // 5. Respond FIRST (the user shouldn't wait for the cache write)
    res.json(
      toOpenAIResponse(r, {
        tenantId: tenant.id,
        reason,
        cache: bypassCache ? "bypass" : "miss",
        escalated,
        usedFallback: rel.usedFallback,
        attempts: rel.attempts,
        costUsd: totalCostUsd,
        savedUsd: 0,
        latencyMs: Date.now() - start,
      }),
    );

    // 6. Then save to cache, but only GOOD answers from the intended model
    const worthCaching =
      !bypassCache && !rel.usedFallback && !needsEscalation(r);
    if (worthCaching) {
      void setCached(cacheKey, r); // "void" = start it, don't wait for it
    }
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
