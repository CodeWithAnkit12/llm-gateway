import { createHash, randomBytes } from "node:crypto";
import { TENANTS, type Tenant } from "../config/tenants.js";   
// One-way fingerprint of a key
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// A new random key, like "gw_x7Kp2..."
export function generateKey(): string {
  return "gw_" + randomBytes(24).toString("base64url");
}

// Lookup table: hash → tenant (built once at startup)
const tenantsByHash = new Map(TENANTS.map((t) => [t.keyHash, t]));

export function findTenantByKey(key: string): Tenant | undefined {
  return tenantsByHash.get(hashKey(key));
}
