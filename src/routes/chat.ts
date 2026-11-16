import { Router } from "express";
import { randomUUID } from "node:crypto";
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
import { MODELS, premiumBaselineUsd, type ModelId } from "../config/models.js";
import type { Tenant } from "../config/tenants.js";
import { route, needsEscalation } from "../router/router.js";
import { makeCacheKey, getCached, setCached } from "../cache/responseCache.js";
import { logRequest } from "../db/logRequest.js";

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

  "x-cache": z.enum(["bypass"]).optional(),

  "x-fallback": z.enum(["off"]).optional(), // client can refuse fallback answers
});


type GatewayMeta = {
  requestId: string;
  tenantId: string;
  reason: string;
  cache: "hit" | "miss" | "bypass";
  escalated: boolean;
  usedFallback: boolean;
  attempts: Attempt[];
  costUsd: number;
  savedUsd: number;
  latencyMs: number;
};

function toOpenAIResponse(r: LLMResult, meta: GatewayMeta) {
  return {
    id: `gw-${meta.requestId}`,
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
      request_id: meta.requestId,
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
  const requestId = randomUUID(); // one ID to trace this request everywhere
  const tenant = res.locals.tenant as Tenant;

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

  const decision = route({
    requestedModel: model,
    messages,
    taskType: headers.data["x-task-type"],
    priority: headers.data["x-priority"],
  });

  // ---- Cache lookup ----
  const cacheKey = makeCacheKey(
    tenant.id,
    decision.modelId,
    messages,
    max_tokens,
  );
  if (!bypassCache) {
    const hit = await getCached(cacheKey);
    if (hit) {
      const r = hit.result;
      const reason = `${decision.reason} → cache hit`;
      const latencyMs = Date.now() - start;
      console.log(`[cache] HIT  tenant=${tenant.id} model=${r.modelId}`);

      res.json(
        toOpenAIResponse(r, {
          requestId,
          tenantId: tenant.id,
          reason,
          cache: "hit",
          escalated: false,
          usedFallback: false,
          attempts: [],
          costUsd: 0,
          savedUsd: r.costUsd,
          latencyMs,
        }),
      );

      void logRequest({
        requestId,
        tenantId: tenant.id,
        requestedModel: model,
        modelId: r.modelId,
        provider: r.provider,
        tier: MODELS[r.modelId].tier,
        routeReason: reason,
        status: "ok",
        httpStatus: 200,
        cache: "hit",
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: 0,
        baselineCostUsd: premiumBaselineUsd(r.inputTokens, r.outputTokens),
        savedUsd: r.costUsd,
        latencyMs,
      });
      return;
    }
  }

  const cacheStatus = bypassCache ? "bypass" : "miss";

  try {
    // ---- AI call with retries + fallback ----
    const rel = await reliableCall(decision.modelId, messages, {
      maxTokens: max_tokens,
      simulateOutage,
      noFallback: headers.data["x-fallback"] === "off",
    });
    let r = rel.result;
    let totalCostUsd = r.costUsd;
    let reason = decision.reason;
    let escalated = false;

    if (rel.usedFallback) reason += ` → fallback to ${r.modelId}`;

    // ---- Safety net: escalation ----
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

    const latencyMs = Date.now() - start;
    console.log(`[router] tenant=${tenant.id} ${r.modelId} | ${reason}`);

    // ---- 1. Respond first ----
    res.json(
      toOpenAIResponse(r, {
        requestId,
        tenantId: tenant.id,
        reason,
        cache: cacheStatus,
        escalated,
        usedFallback: rel.usedFallback,
        attempts: rel.attempts,
        costUsd: totalCostUsd,
        savedUsd: 0,
        latencyMs,
      }),
    );

    // ---- 2. Then background work: cache + log ----
    if (!bypassCache && !rel.usedFallback && !needsEscalation(r)) {
      void setCached(cacheKey, r);
    }
    void logRequest({
      requestId,
      tenantId: tenant.id,
      requestedModel: model,
      modelId: r.modelId,
      provider: r.provider,
      tier: MODELS[r.modelId].tier,
      routeReason: reason,
      status: "ok",
      httpStatus: 200,
      cache: cacheStatus,
      escalated,
      usedFallback: rel.usedFallback,
      attempts: rel.attempts.length,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: totalCostUsd,
      baselineCostUsd: premiumBaselineUsd(r.inputTokens, r.outputTokens),
      latencyMs,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;

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
      void logRequest({
        requestId,
        tenantId: tenant.id,
        requestedModel: model,
        routeReason: decision.reason,
        status: "error",
        httpStatus: 502,
        cache: cacheStatus,
        attempts: err.attempts.length,
        latencyMs,
        error: err.attempts.map((a) => `${a.modelId}: ${a.error}`).join(" | "),
      });
      return;
    }

    console.error("[chat] unexpected error:", err);
    res.status(500).json({ error: { message: "Internal gateway error" } });
    void logRequest({
      requestId,
      tenantId: tenant.id,
      requestedModel: model,
      status: "error",
      httpStatus: 500,
      cache: cacheStatus,
      latencyMs,
      error: (err as Error).message,
    });
  }
});
