import { closeRepository } from "@precall/worker/repository";
import { expirePublishedCalls, health, resolveMatureCalls, runOnce, runSportsEdge } from "@precall/worker/run-cycle";

export type WorkerCommand = "health" | "run-once" | "sports" | "resolve" | "expire";

function serializeResult(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  ) as unknown;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

const workerCommandHints: Record<WorkerCommand, string> = {
  health: "railway run npm run worker:health",
  "run-once": "railway run npm run worker:run-once",
  sports: "railway run npm run worker:sports",
  resolve: "railway run npm run worker:resolve",
  expire: "railway run npm run worker:expire",
};

const defaultRemoteTimeoutMs: Record<WorkerCommand, number> = {
  health: 45_000,
  expire: 120_000,
  resolve: 285_000,
  sports: 285_000,
  "run-once": 285_000,
};

function remoteTimeoutMs(command: WorkerCommand) {
  const specific = process.env[`WORKER_${command.toUpperCase().replace(/-/g, "_")}_TIMEOUT_MS`];
  const configured = Number(specific || process.env.WORKER_ROUTE_TIMEOUT_MS || defaultRemoteTimeoutMs[command]);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultRemoteTimeoutMs[command];
}

function workerTriggerConfig() {
  const url = (process.env.WORKER_TRIGGER_URL || "").replace(/\/+$/, "");
  const secret = process.env.WORKER_TRIGGER_SECRET || "";
  return { url, secret, configured: Boolean(url && secret) };
}

async function runRemoteWorkerCommand(command: WorkerCommand, startedAt: number) {
  const config = workerTriggerConfig();
  const timeoutMs = remoteTimeoutMs(command);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.url}/worker/${command}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.secret}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({ error: "Remote worker returned non-JSON response." }))) as Record<string, unknown>;
    return {
      ...payload,
      ok: response.ok && payload.ok !== false,
      command,
      proxiedToRailway: true,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        command,
        status: "timeout",
        timedOut: true,
        proxiedToRailway: true,
        durationMs: Date.now() - startedAt,
        timeoutMs,
        suggestedCommand: workerCommandHints[command],
        error: `Railway worker did not return within ${Math.round(timeoutMs / 1000)}s. The run may still be executing or may have been cancelled by the HTTP proxy; check Railway logs before re-running.`,
      };
    }
    return {
      ok: false,
      command,
      proxiedToRailway: true,
      durationMs: Date.now() - startedAt,
      error: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runWorkerCommand(command: WorkerCommand) {
  const startedAt = Date.now();
  const remote = workerTriggerConfig();

  if (remote.configured) return runRemoteWorkerCommand(command, startedAt);

  if (process.env.DISABLE_SCHEDULED_WORKERS === "true") {
    return {
      ok: true,
      command,
      disabled: true,
      durationMs: Date.now() - startedAt,
      result: "Scheduled worker execution is disabled for this deployment. Configure WORKER_TRIGGER_URL and WORKER_TRIGGER_SECRET to proxy admin actions to Railway.",
    };
  }

  try {
    const result = command === "health" ? await health() : command === "run-once" ? await runOnce() : command === "sports" ? await runSportsEdge() : command === "expire" ? await expirePublishedCalls() : await resolveMatureCalls();
    return {
      ok: true,
      command,
      durationMs: Date.now() - startedAt,
      result: serializeResult(result),
    };
  } catch (error) {
    return {
      ok: false,
      command,
      durationMs: Date.now() - startedAt,
      error: errorMessage(error),
    };
  } finally {
    await closeRepository();
  }
}
