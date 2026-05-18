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
