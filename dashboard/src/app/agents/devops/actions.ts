"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getAgentMemoryMarkdown } from "@/lib/agent-memory";

export type DevOpsRunState =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

export async function runDevOpsAgent(_prev: DevOpsRunState, formData: FormData): Promise<DevOpsRunState> {
  const focus = String(formData.get("focus") ?? "").trim();
  const active = await prisma.agentJob.findFirst({
    where: { kind: "codex", runner: "LOCAL", status: { in: ["QUEUED", "CLAIMED"] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (active) {
    return { ok: false, error: "Another Codex run is already in progress — please wait until it finishes." };
  }

  const text =
    `Generate my DevOps research radar report.\n` +
    `Stack: Octopus, Jenkins, Backstage, Atlassian, Teams, JBoss, Grafana, Kibana.\n` +
    `Use live public web research when available. Start with searches like:\n` +
    `- node scripts/research-web.mjs "latest Octopus Deploy release Jenkins Backstage Grafana Kibana DevOps platform engineering"\n` +
    `- node scripts/research-web.mjs "new platform engineering tools 2026 CI CD observability internal developer portal"\n` +
    `Output: what is new, source links, why it matters for our stack, how it improves current tools, implementation steps, what changed since last run, a 30-minute starter task.\n` +
    `Do not repeat stale advice unless there is new evidence or a better implementation path.\n` +
    (focus ? `\nFOCUS:\n${focus}\n` : "");
  const memoryMarkdown = await getAgentMemoryMarkdown("devops");

  const job = await prisma.agentJob.create({
    data: {
      kind: "codex",
      runner: "LOCAL",
      status: "QUEUED",
      payloadJson: JSON.stringify({ text, context: "devops", agentType: "devops", focus, memoryMarkdown }),
    },
  });

  await prisma.agentRun.create({
    data: {
      agentType: "devops",
      status: "running",
      sourceJobId: job.id,
      inputJson: JSON.stringify({ focus }),
    },
  });

  revalidatePath("/agents/devops");
  revalidatePath("/");
  revalidatePath("/codex");
  revalidatePath("/ai");

  return { ok: true, jobId: job.id };
}
