import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireAgentToken } from "../_auth";
import { rememberAgentReport } from "@/lib/agent-memory";

const schema = z.object({
  id: z.string().min(1),
  status: z.enum(["CLAIMED", "SUCCEEDED", "FAILED"]),
  resultText: z.string().optional(),
  errorText: z.string().optional(),
  append: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = requireAgentToken(request);
  if (auth) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { id, status, resultText, errorText, append } = parsed.data;

  const tryUpdateAgentRun = async (job: { id: string; kind: string; payloadJson: string }, finalStatus?: "SUCCEEDED" | "FAILED", nextResult?: string | null, nextError?: string | null) => {
    if (job.kind !== "codex" && job.kind !== "automation") return;
    let agentType: string | null = null;
    try {
      const payload = JSON.parse(job.payloadJson ?? "{}") as Record<string, unknown>;
      agentType = typeof payload.agentType === "string" ? payload.agentType : null;
    } catch {
      agentType = null;
    }
    if (!agentType) return;

    const run = await prisma.agentRun.findUnique({ where: { sourceJobId: job.id } }).catch(() => null);
    if (!run) return;

    const patch: Record<string, unknown> = {};
    if (finalStatus) {
      patch.status = finalStatus === "SUCCEEDED" ? "succeeded" : "failed";
      patch.finishedAt = new Date();
      if (typeof nextResult === "string") patch.outputMarkdown = nextResult;
      if (typeof nextError === "string" && nextError) patch.error = nextError;
    } else {
      // live-ish updates for running jobs (optional)
      if (typeof nextResult === "string") patch.outputMarkdown = nextResult;
      if (typeof nextError === "string" && nextError) patch.error = nextError;
    }
    const updatedRun = await prisma.agentRun.update({ where: { id: run.id }, data: patch });

    if (finalStatus === "SUCCEEDED" && typeof nextResult === "string" && nextResult.trim()) {
      await rememberAgentReport({
        agentType,
        runId: updatedRun.id,
        jobId: job.id,
        outputMarkdown: nextResult,
      });
    }
  };

  if (status === "CLAIMED") {
    const existing = await prisma.agentJob.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });

    const nextResult =
      typeof resultText === "string"
        ? append
          ? `${existing.resultText ?? ""}${resultText}`
          : resultText
        : existing.resultText ?? null;

    const updated = await prisma.agentJob.update({
      where: { id },
      data: {
        status: "CLAIMED",
        resultText: nextResult,
        errorText: typeof errorText === "string" ? errorText : existing.errorText ?? null,
      },
    });

    await tryUpdateAgentRun(updated, undefined, nextResult, updated.errorText ?? null).catch(() => {});
    return NextResponse.json({ ok: true, job: updated });
  }

  const existing = await prisma.agentJob.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });

  const nextResult =
    typeof resultText === "string"
      ? append
        ? `${existing.resultText ?? ""}${resultText}`
        : resultText
      : existing.resultText ?? null;

  const updated = await prisma.agentJob.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      resultText: nextResult,
      errorText: typeof errorText === "string" ? errorText : existing.errorText ?? null,
    },
  });

  await tryUpdateAgentRun(updated, status, nextResult, updated.errorText ?? null).catch(() => {});
  return NextResponse.json({ ok: true, job: updated });
}
