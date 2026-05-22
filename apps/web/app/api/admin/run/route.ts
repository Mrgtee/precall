import { NextResponse } from "next/server";
import { runWorkerCommand, type WorkerCommand } from "../../../../lib/worker-runner";
import { isWorkerAdminAction, verifyAdminSignature, type AdminChallenge } from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    address?: string;
    message?: string;
    signature?: `0x${string}`;
    challenge?: AdminChallenge;
  };
  const action = body.action || "run-once";
  if (!isWorkerAdminAction(action)) {
    return NextResponse.json({ error: "Valid worker admin action is required." }, { status: 400 });
  }

  const secret = request.headers.get("x-admin-secret");
  const hasLegacySecret = Boolean(process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET);

  if (!hasLegacySecret) {
    if (!body.address || !body.message || !body.signature || !body.challenge) {
      return NextResponse.json({ error: "Wallet signature is required." }, { status: 401 });
    }
    const verification = await verifyAdminSignature({
      action,
      address: body.address,
      message: body.message,
      signature: body.signature,
      challenge: body.challenge,
    });
    if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: 401 });
  }

  const result = await runWorkerCommand(action as WorkerCommand);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
