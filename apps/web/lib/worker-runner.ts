import { closeRepository } from "@precall/worker/repository";
import { resolveMatureCalls, runOnce } from "@precall/worker/run-cycle";

export type WorkerCommand = "run-once" | "resolve";

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

  try {
    const result = command === "run-once" ? await runOnce() : await resolveMatureCalls();
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
