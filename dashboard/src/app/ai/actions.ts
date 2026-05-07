"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function queueJob(formData: FormData) {
  const kind = String(formData.get("kind") ?? "note").trim() || "note";
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;

  const runner = kind === "shell" || kind === "combine_scan" ? "LOCAL" : "VPS";
  await prisma.agentJob.create({
    data: {
      kind,
      runner,
      payloadJson: JSON.stringify({ text }),
      status: "QUEUED",
    },
  });

  revalidatePath("/ai");
  revalidatePath("/");
}

export async function cancelJob(id: string) {
  await prisma.agentJob.update({
    where: { id },
    data: { status: "CANCELED", finishedAt: new Date() },
  });
  revalidatePath("/ai");
  revalidatePath("/");
}
