import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireAgentToken } from "../_auth";

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

  return NextResponse.json({ ok: true, job: updated });
}
