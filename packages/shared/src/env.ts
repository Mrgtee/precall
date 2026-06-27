export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is required. Set it in .env before running this command.`);
  }
  return value.trim();
}

export function optionalEnv(name: string, fallback = ""): string {
  return (process.env[name] || fallback).trim();
}

export function boolEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|y|on)$/i.test(value);
}

export function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function llmConfig() {
  const geminiKey = process.env.GEMINI_API_KEY || (process.env.OPENAI_API_KEY?.startsWith("AIzaSy") ? process.env.OPENAI_API_KEY : undefined);
  if (geminiKey) {
    const rawModel = process.env.OPENAI_MODEL || "gemini-2.5-flash";
    const model = rawModel.startsWith("gemini-") ? rawModel : "gemini-2.5-flash";
    return {
      apiKey: geminiKey,
      baseUrl: process.env.OPENAI_BASE_URL && !process.env.OPENAI_BASE_URL.includes("api.openai.com") && !process.env.OPENAI_BASE_URL.includes("freemodel.dev")
        ? process.env.OPENAI_BASE_URL
        : "https://generativelanguage.googleapis.com/v1beta/openai/",
      model,
    };
  }
  return {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  };
}

