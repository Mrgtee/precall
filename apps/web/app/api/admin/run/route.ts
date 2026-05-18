import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const child = spawn("npm", ["run", "worker", "--", "run-once"], {
    cwd: process.cwd().replace(/\/apps\/web$/, ""),
    env: process.env,
    stdio: "pipe",
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  return NextResponse.json({ exitCode, stdout, stderr }, { status: exitCode === 0 ? 200 : 500 });
}
