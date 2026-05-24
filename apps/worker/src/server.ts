#!/usr/bin/env node
import { createServer } from "node:http";
import { loadDotenv } from "./dotenv";
import { closeRepository } from "./repository";
import { expirePublishedCalls, health, resolveMatureCalls, runOnce, runSportsEdge } from "./run-cycle";

loadDotenv();

type WorkerTriggerCommand = "health" | "run-once" | "sports" | "expire" | "resolve";

const commands = new Set<WorkerTriggerCommand>(["health", "run-once", "sports", "expire", "resolve"]);

function serializeResult(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  ) as unknown;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.stack || error.message : String(error);
}


function workerBuildInfo() {
  return {
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "unknown",
    schemaRepair: "0008_sports_predictions",
  };
}

function authorized(headers: Headers) {
  const secret = process.env.WORKER_TRIGGER_SECRET;
  if (!secret) return false;
  const auth = headers.get("authorization");
  const headerSecret = headers.get("x-worker-trigger-secret");
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

async function execute(command: WorkerTriggerCommand) {
  if (command === "health") return health();
  if (command === "run-once") return runOnce();
  if (command === "sports") return runSportsEdge();
  if (command === "expire") return expirePublishedCalls();
  return resolveMatureCalls();
}

function jsonResponse(res: import("node:http").ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
}

const server = createServer(async (req, res) => {
  const startedAt = Date.now();
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const headers = new Headers(req.headers as Record<string, string>);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
    jsonResponse(res, 200, { ok: true, service: "precall-worker", worker: workerBuildInfo(), endpoints: ["/worker/health", "/worker/run-once", "/worker/sports", "/worker/expire", "/worker/resolve"] });
    return;
  }

  const match = url.pathname.match(/^\/worker\/(health|run-once|sports|expire|resolve)$/);
  if (req.method !== "POST" || !match) {
    jsonResponse(res, 404, { ok: false, error: "Use POST /worker/health, /worker/run-once, /worker/sports, /worker/expire, or /worker/resolve." });
    return;
  }

  if (!authorized(headers)) {
    jsonResponse(res, 401, { ok: false, error: "Unauthorized worker trigger." });
    return;
  }

  const command = match[1] as WorkerTriggerCommand;
  if (!commands.has(command)) {
    jsonResponse(res, 400, { ok: false, error: "Unsupported worker command." });
    return;
  }

  try {
    const result = await execute(command);
    jsonResponse(res, 200, { ok: true, command, durationMs: Date.now() - startedAt, result: serializeResult(result) });
  } catch (error) {
    jsonResponse(res, 500, { ok: false, command, durationMs: Date.now() - startedAt, error: errorMessage(error) });
  } finally {
    await closeRepository();
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, () => {
  console.log(`Precall worker trigger server listening on port ${port}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down Precall worker server.`);
  server.close(async () => {
    await closeRepository();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
