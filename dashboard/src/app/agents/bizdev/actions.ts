"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export type BizDevRunState =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

export async function runBizDevAgent(_prev: BizDevRunState, formData: FormData): Promise<BizDevRunState> {
  const notes = String(formData.get("notes") ?? "").trim();
  const active = await prisma.agentJob.findFirst({
    where: { kind: "codex", runner: "LOCAL", status: { in: ["QUEUED", "CLAIMED"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (active) {
    return { ok: false, error: "Another Codex run is already in progress — please wait until it finishes." };
  }

  const text =
    `Generate my BizDev report.\n` +
    `Goal: win more snow removal + landscaping clients for Allsite.\n` +
    `Use proof points: KeyBank + GetGo satisfaction; certified woman-owned business.\n` +
    `Output: Targets (multi-site), decision-maker roles, outreach drafts (email + call), next 3 actions.\n` +
    (notes ? `\nNOTES:\n${notes}\n` : "");

  const job = await prisma.agentJob.create({
    data: {
      kind: "codex",
      runner: "LOCAL",
      status: "QUEUED",
      payloadJson: JSON.stringify({ text, context: "bizdev", agentType: "bizdev", notes }),
    },
  });

  await prisma.agentRun.create({
    data: {
      agentType: "bizdev",
      status: "running",
      sourceJobId: job.id,
      inputJson: JSON.stringify({ notes }),
    },
  });

  revalidatePath("/agents/bizdev");
  revalidatePath("/");
  revalidatePath("/codex");
  revalidatePath("/ai");

  return { ok: true, jobId: job.id };
}
