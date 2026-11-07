import { generateKey, hashKey } from "../auth/apiKeys.js";

const tenantId = process.argv[2] ?? "unnamed";
const key = generateKey();

console.log(`Tenant  : ${tenantId}`);
console.log(`API key : ${key}`);
console.log(
  `          ↑ give this to the client. Save it now, it's shown ONCE.`,
);
console.log(`Hash    : ${hashKey(key)}`);
console.log(`          ↑ paste this into src/config/tenants.ts`);
