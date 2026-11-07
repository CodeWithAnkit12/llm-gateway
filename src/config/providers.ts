import OpenAI from "openai";

export type ProviderName = "groq" | "gemini" | "openrouter";

type ProviderConfig = {
  baseURL: string; 
  apiKeyEnv: string; 
};

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: "GEMINI_API_KEY",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
};

const clients = new Map<ProviderName, OpenAI>();

export function getClient(provider: ProviderName): OpenAI {
  const existing = clients.get(provider);
  if (existing) return existing;

  const config = PROVIDERS[provider];
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${config.apiKeyEnv} is missing in .env`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: config.baseURL,
    timeout: 20_000, 
    maxRetries: 0, 
  });

  clients.set(provider, client);
  return client;
}
