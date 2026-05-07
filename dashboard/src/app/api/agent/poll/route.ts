import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAgentToken } from "../_auth";

export async function GET(request: Request) {
  const auth = requireAgentToken(request);
  if (auth) return auth;

  const url = new URL(request.url);
  const agentId = url.searchParams.get("agent_id") ?? "unknown-agent";
  const runner = (url.searchParams.get("runner") ?? "LOCAL").toUpperCase() === "VPS" ? "VPS" : "LOCAL";

  const job = await prisma.agentJob.findFirst({
    where: { status: "QUEUED", runner },
    orderBy: { createdAt: "asc" },
  });

  if (!job) return NextResponse.json({ ok: true, job: null });

  const claimed = await prisma.agentJob.update({
    where: { id: job.id },
    data: { status: "CLAIMED", claimedBy: agentId, claimedAt: new Date() },
  });

  return NextResponse.json({ ok: true, job: claimed });
}
