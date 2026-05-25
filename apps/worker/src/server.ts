#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { loadDotenv } from "./dotenv";
import { closeRepository } from "./repository";
import { expirePublishedCalls, health, resolveMatureCalls, runOnce, runSportsEdge } from "./run-cycle";

loadDotenv();

type WorkerTriggerCommand = "health" | "run-once" | "sports" | "expire" | "resolve";
type WorkerJobStatus = "running" | "completed" | "failed";
type WorkerJob = {
  id: string;
  command: WorkerTriggerCommand;
  status: WorkerJobStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
};

const commands = new Set<WorkerTriggerCommand>(["health", "run-once", "sports", "expire", "resolve"]);
const asyncCommands = new Set<WorkerTriggerCommand>(["run-once", "sports", "resolve"]);
const jobs = new Map<string, WorkerJob>();

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
    schemaRepair: "0011_sports_event_expiry",
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

function publicJob(job: WorkerJob, includeResult = false) {
  return {
    id: job.id,
    command: job.command,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    durationMs: job.durationMs,
    result: includeResult && job.result ? serializeResult(job.result) : undefined,
    error: job.error,
  };
}

function latestJobs(limit = 8) {
  return [...jobs.values()]
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .slice(0, limit)
    .map((job) => publicJob(job));
}

function findRunningJob(command: WorkerTriggerCommand) {
  return [...jobs.values()].find((job) => job.command === command && job.status === "running");
}

function startAsyncJob(command: WorkerTriggerCommand) {
  const existing = findRunningJob(command);
  if (existing) return { job: existing, alreadyRunning: true };

  const job: WorkerJob = { id: randomUUID(), command, status: "running", startedAt: new Date().toISOString() };
  jobs.set(job.id, job);

  void (async () => {
    const startedAt = Date.parse(job.startedAt);
    try {
      job.result = await execute(command);
      job.status = "completed";
    } catch (error) {
      job.status = "failed";
      job.error = errorMessage(error);
    } finally {
      job.finishedAt = new Date().toISOString();
      job.durationMs = Date.now() - startedAt;
      await closeRepository();
    }
  })();

  return { job, alreadyRunning: false };
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
    jsonResponse(res, 200, { ok: true, service: "precall-worker", worker: workerBuildInfo(), endpoints: ["/worker/health", "/worker/run-once", "/worker/sports", "/worker/expire", "/worker/resolve", "/worker/jobs/:id"], jobs: latestJobs() });
    return;
  }

  const jobMatch = url.pathname.match(/^\/worker\/jobs\/([a-f0-9-]+)$/i);
  if (req.method === "GET" && jobMatch) {
    if (!authorized(headers)) {
      jsonResponse(res, 401, { ok: false, error: "Unauthorized worker trigger." });
      return;
    }
    const job = jobs.get(jobMatch[1] || "");
    if (!job) {
      jsonResponse(res, 404, { ok: false, error: "Worker job was not found." });
      return;
    }
    jsonResponse(res, 200, { ok: true, job: publicJob(job, true) });
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

  const asyncMode = asyncCommands.has(command) && (url.searchParams.get("mode") === "async" || headers.get("x-worker-async") === "true");
  if (asyncMode) {
    const { job, alreadyRunning } = startAsyncJob(command);
    jsonResponse(res, alreadyRunning ? 200 : 202, {
      ok: true,
      command,
      status: job.status,
      async: true,
      alreadyRunning,
      job: publicJob(job),
      message: alreadyRunning
        ? `${command} is already running on Railway.`
        : `${command} started on Railway. Long-running jobs continue after the admin request returns.`,
    });
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
