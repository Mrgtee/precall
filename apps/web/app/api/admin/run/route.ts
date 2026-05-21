import { NextResponse } from "next/server";
import { runWorkerCommand } from "../../../../lib/worker-runner";

export async function POST(request: Request) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runWorkerCommand("run-once");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
