"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export type CodexQueueState =
  | { ok: true; jobId: string }
  | { ok: false; error: string; activeJobId?: string };

export async function queueCodexTask(_prev: CodexQueueState, formData: FormData): Promise<CodexQueueState> {
  const text = String(formData.get("text") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();
  if (!text) return { ok: false, error: "Please type a request." };

  const active = await prisma.agentJob.findFirst({
    where: {
      kind: "codex",
      runner: "LOCAL",
      status: { in: ["QUEUED", "CLAIMED"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (active) {
    return {
      ok: false,
      error: "Another Codex run is already in progress — please wait until it finishes.",
      activeJobId: active.id,
    };
  }

  const job = await prisma.agentJob.create({
    data: {
      kind: "codex",
      runner: "LOCAL",
      payloadJson: JSON.stringify({ text, context }),
      status: "QUEUED",
    },
  });

  revalidatePath("/");
  revalidatePath("/codex");
  revalidatePath("/ai");

  return { ok: true, jobId: job.id };
}
