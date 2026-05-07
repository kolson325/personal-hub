"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function queueCodexTask(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();
  if (!text) return;

  await prisma.agentJob.create({
    data: {
      kind: "codex",
      runner: "LOCAL",
      payloadJson: JSON.stringify({ text, context }),
      status: "QUEUED",
    },
  });

  revalidatePath("/");
  revalidatePath("/ai");
}

