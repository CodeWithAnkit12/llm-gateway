export type Tenant = {
  id: string;
  name: string;
  keyHash: string; // the HASH of the key, never the key itself
  requestsPerMinute: number;
};

// Generate keys with: npm run new-key -- <tenant-id>
export const TENANTS: Tenant[] = [
  {
    id: "acme",
    name: "Acme Corp (demo)",
    keyHash: "219e577f420c7c648c83ef25c896a64210843668a85e19223088bbe5e55b1a0e",
    requestsPerMinute: 3, // tiny on purpose, so we can test the limit
  },
  {
    id: "globex",
    name: "Globex (demo)",
    keyHash: "1089b3129814a3088ed32e481efb6abb746b714e95f7f3061b6ba63f3a4e3319",
    requestsPerMinute: 20,
  },
];
