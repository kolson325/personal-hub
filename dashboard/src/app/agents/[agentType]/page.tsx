import { notFound } from "next/navigation";
import { TopNav } from "@/app/_components/TopNav";
import { AgentReportSurface } from "@/app/_components/AgentReportSurface";
import { queueCodexTask } from "@/app/actions";
import { prisma } from "@/lib/db";
import { AGENT_PROFILE_BY_ID } from "@/lib/agent-profiles";
import { getAgentMemory } from "@/lib/agent-memory";

export const dynamic = "force-dynamic";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentType: string }>;
}) {
  const { agentType } = await params;
  const profile = AGENT_PROFILE_BY_ID.get(agentType);
  if (!profile) notFound();

  const [runs, memory] = await Promise.all([
    prisma.agentRun.findMany({
      where: { agentType },
      orderBy: { startedAt: "desc" },
      take: 12,
    }),
    getAgentMemory(agentType),
  ]);

  return (
    <main className="min-h-screen">
      <TopNav title={profile.title} subtitle={profile.mission} />
      <section className="mx-auto max-w-6xl px-6 py-6">
        <AgentReportSurface profile={profile} runs={runs} memory={memory} queueAction={queueCodexTask} />
      </section>
    </main>
  );
}
