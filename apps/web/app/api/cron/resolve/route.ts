import { runWorkerCommand } from "../../../../lib/worker-runner";
import { errorJson, hasBearerSecret, noStoreJson } from "../../../../lib/api-security";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  return hasBearerSecret(request, process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return errorJson("Unauthorized.", 401);
  }

  if (process.env.DISABLE_SCHEDULED_WORKERS === "true") {
    return noStoreJson({ ok: true, disabled: true, result: "Vercel cron is disabled because Railway owns scheduled worker execution." });
  }

  const result = await runWorkerCommand("resolve");
  return noStoreJson(result, { status: result.ok ? 200 : 500 });
}
