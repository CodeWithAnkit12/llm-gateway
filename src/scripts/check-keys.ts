import "dotenv/config";
import { hashKey } from "../auth/apiKeys.js";
import { TENANTS } from "../config/tenants.js";

console.log("--- Keys in .env ---");
for (const name of ["TEST_KEY_ACME", "TEST_KEY_GLOBEX"]) {
  const key = process.env[name];
  if (!key) {
    console.log(`${name}: MISSING in .env`);
    continue;
  }
  const hash = hashKey(key);
  const match = TENANTS.find((t) => t.keyHash === hash);
  // Only print the first few characters: never print full secrets!
  console.log(
    `${name}: starts "${key.slice(0, 6)}..." (length ${key.length}) -> ` +
      (match ? `MATCHES tenant "${match.id}" ✅` : "NO MATCH ❌"),
  );
}

console.log("\n--- Hashes in tenants.ts ---");
for (const t of TENANTS) {
  console.log(
    `${t.id}: starts "${t.keyHash.slice(0, 8)}..." (length ${t.keyHash.length}, should be 64)`,
  );
}
