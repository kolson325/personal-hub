import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { requireAgentToken } from "../_auth";

const schema = z.object({
  id: z.string().min(1),
  status: z.enum(["SUCCEEDED", "FAILED"]),
  resultText: z.string().optional(),
  errorText: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = requireAgentToken(request);
  if (auth) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const { id, status, resultText, errorText } = parsed.data;
  const updated = await prisma.agentJob.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      resultText: resultText ?? null,
      errorText: errorText ?? null,
    },
  });

  return NextResponse.json({ ok: true, job: updated });
}

