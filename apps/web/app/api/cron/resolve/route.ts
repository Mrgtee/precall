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

  const result = await runWorkerCommand("resolve");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
