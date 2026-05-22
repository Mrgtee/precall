import { NextResponse } from "next/server";
import { runWorkerCommand } from "../../../../lib/worker-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (process.env.DISABLE_SCHEDULED_WORKERS === "true") {
    return NextResponse.json({ ok: true, disabled: true, result: "Vercel cron is disabled because Railway owns scheduled worker execution." });
  }

  const result = await runWorkerCommand("run-once");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
