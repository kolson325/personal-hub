import { prisma } from "@/lib/db";
import { runDevOpsAgent } from "./actions";
import { TopNav } from "@/app/_components/TopNav";
import { queueCodexTask } from "@/app/actions";
import { AgentReportSurface } from "@/app/_components/AgentReportSurface";
import { AGENT_PROFILE_BY_ID } from "@/lib/agent-profiles";
import { getAgentMemory } from "@/lib/agent-memory";

export const dynamic = "force-dynamic";

export default async function DevOpsAgentPage() {
  const [runs, memory] = await Promise.all([
    prisma.agentRun.findMany({
      where: { agentType: "devops" },
      orderBy: { startedAt: "desc" },
      take: 12,
    }),
    getAgentMemory("devops"),
  ]);
  const profile = AGENT_PROFILE_BY_ID.get("devops")!;

  return (
    <main className="min-h-screen">
      <TopNav
        title="DevOps Tech Radar Agent"
        subtitle="New tech summaries + implementation ideas (Octopus/Jenkins/Backstage/Atlassian/Teams/JBoss/Grafana/Kibana)."
      />

      <section className="mx-auto max-w-6xl px-6 py-6">
        <AgentReportSurface
          profile={profile}
          runs={runs}
          memory={memory}
          queueAction={queueCodexTask}
          runAction={runDevOpsAgent}
          runFieldName="focus"
          runFieldPlaceholder="Optional: tool, architecture, migration, or concept to focus on today."
        />
      </section>
    </main>
  );
}
