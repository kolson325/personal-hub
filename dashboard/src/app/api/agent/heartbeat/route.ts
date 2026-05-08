import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAgentToken } from "../_auth";
import { z } from "zod";

const schema = z.object({
  agentId: z.string().min(1),
  runner: z.enum(["LOCAL", "VPS"]).default("LOCAL"),
});

export async function POST(request: Request) {
  const auth = requireAgentToken(request);
  if (auth) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const { agentId, runner } = parsed.data;
  const hb = await prisma.agentHeartbeat.upsert({
    where: { agentId_runner: { agentId, runner } },
    update: { lastSeenAt: new Date() },
    create: { agentId, runner, lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true, heartbeat: hb });
}

