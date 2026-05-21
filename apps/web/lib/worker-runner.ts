import { closeRepository } from "@precall/worker/repository";
import { health, resolveMatureCalls, runOnce } from "@precall/worker/run-cycle";

export type WorkerCommand = "health" | "run-once" | "resolve";

function serializeResult(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  ) as unknown;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

export async function runWorkerCommand(command: WorkerCommand) {
  const startedAt = Date.now();

  if (process.env.DISABLE_SCHEDULED_WORKERS === "true") {
    return {
      ok: true,
      command,
      disabled: true,
      durationMs: Date.now() - startedAt,
      result: "Scheduled worker execution is disabled for this deployment.",
    };
  }

  try {
    const result = command === "health" ? await health() : command === "run-once" ? await runOnce() : await resolveMatureCalls();
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
