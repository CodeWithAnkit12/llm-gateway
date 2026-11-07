import type { Request, Response, NextFunction } from "express";
import { findTenantByKey } from "../auth/apiKeys.js";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  // The OpenAI SDK sends the key as: Authorization: Bearer <key>
  const header = req.headers.authorization ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!key) {
    res
      .status(401)
      .json({
        error: {
          message: "Missing API key. Send: Authorization: Bearer <key>",
        },
      });
    return;
  }

  const tenant = findTenantByKey(key);
  if (!tenant) {
    res.status(401).json({ error: { message: "Invalid API key" } });
    return;
  }

  res.locals.tenant = tenant; // pass "who is this" to the next steps
  next(); // let the request continue
}
