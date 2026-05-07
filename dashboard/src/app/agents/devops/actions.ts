"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function runDevOpsAgent(formData: FormData) {
  const focus = String(formData.get("focus") ?? "").trim();
  const run = await prisma.agentRun.create({
    data: { agentType: "devops", status: "running", inputJson: JSON.stringify({ focus }) },
  });

  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "succeeded",
      finishedAt: new Date(),
      outputMarkdown:
        `## DevOps Tech Radar (MVP placeholder)\n\n` +
        `Focus: ${focus || "—"}\n\n` +
        `Suggested “next tech” buckets to monitor:\n` +
        `- Platform engineering: Backstage plugins, golden paths, scorecards.\n` +
        `- CI/CD: ephemeral environments, progressive delivery, OPA policy-as-code.\n` +
        `- Observability: OpenTelemetry maturity, eBPF-based tooling, SLO tooling.\n` +
        `- Supply chain: SBOMs, SLSA, provenance signing, secret scanning.\n\n` +
        `Next steps to make this real:\n` +
        `- Add RSS/source list + summarizer.\n` +
        `- Store “what changed” diffs and a weekly digest.\n`,
    },
  });

  revalidatePath("/agents/devops");
}

