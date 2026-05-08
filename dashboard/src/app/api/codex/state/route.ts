import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function safeJsonParse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const [active, recent, hb] = await Promise.all([
    prisma.agentJob.findFirst({
      where: { kind: "codex", runner: "LOCAL", status: { in: ["QUEUED", "CLAIMED"] } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.agentJob.findMany({
      where: { kind: "codex", runner: "LOCAL" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.agentHeartbeat.findFirst({
      where: { runner: "LOCAL" },
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);

  const mappedRecent = recent
    .slice()
    .reverse()
    .map((j) => {
      const payload = safeJsonParse<{ text?: string; context?: string }>(j.payloadJson) ?? {};
      return {
        id: j.id,
        status: j.status,
        createdAt: j.createdAt,
        claimedAt: j.claimedAt,
        finishedAt: j.finishedAt,
        payload,
        resultText: j.resultText,
        errorText: j.errorText,
      };
    });

  const activePayload =
    active ? safeJsonParse<{ text?: string; context?: string }>(active.payloadJson) ?? {} : null;

  return NextResponse.json({
    ok: true,
    active: active
      ? {
          id: active.id,
          status: active.status,
          createdAt: active.createdAt,
          claimedAt: active.claimedAt,
          payload: activePayload,
          resultText: active.resultText,
          errorText: active.errorText,
        }
      : null,
    recent: mappedRecent,
    companion: hb ? { agentId: hb.agentId, lastSeenAt: hb.lastSeenAt } : null,
  });
}
