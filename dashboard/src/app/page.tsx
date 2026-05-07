import Link from "next/link";
import { prisma } from "@/lib/db";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [openTodos, queuedJobs] = await Promise.all([
    prisma.todoItem.count({ where: { status: "OPEN" } }),
    prisma.agentJob.count({ where: { status: "QUEUED" } }),
  ]);
  return { openTodos, queuedJobs };
}

export default async function DashboardHome() {
  const counts = await getCounts();
  const recentJobs = await prisma.agentJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Allsite Dashboard</h1>
            <p className="text-xs text-neutral-500">Central hub, tasks, agents, and deploy controls.</p>
          </div>
          <form action={logout}>
            <button className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50">Sign out</button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">AI / Agent Bridge</h2>
              <span className="text-xs text-neutral-500">{counts.queuedJobs} queued</span>
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              This is the hook for a local companion agent that can run approved tasks on your computer (later: Codex,
              repo scans, deployments).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white" href="/ai">
                Open AI panel
              </Link>
              <Link className="rounded-lg border px-3 py-2 text-sm" href="/deploy">
                Redeploy controls
              </Link>
            </div>
            <div className="mt-4">
              <div className="text-xs font-medium text-neutral-500">Recent jobs</div>
              <ul className="mt-2 space-y-2 text-sm">
                {recentJobs.length === 0 ? (
                  <li className="text-neutral-500">No jobs yet.</li>
                ) : (
                  recentJobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="truncate pr-3">{j.kind}</span>
                      <span className="text-xs text-neutral-500">{j.status}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Central Hub (site photos)</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Currently pointed at your existing URL. Later we’ll move this to the VPS so it’s truly always-on.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white"
                href={process.env.ALLSITE_CENTRAL_HUB_URL ?? "https://allsitefacilities-centralhub.loca.lt"}
                target="_blank"
                rel="noreferrer"
              >
                Open central hub
              </a>
              <Link className="rounded-lg border px-3 py-2 text-sm" href="/central-hub">
                Embed view
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Panel
            title="Allsite TODOs"
            subtitle={`${counts.openTodos} open`}
            href="/todo"
            description="Persistent work + life task list. Later: auto-triage from Gmail."
          />
          <Panel
            title="BizDev Agent"
            subtitle="Research + outreach"
            href="/agents/bizdev"
            description="Target corporations for snow + landscaping, with contact lists and drafts."
          />
          <Panel
            title="DevOps Tech Radar"
            subtitle="Explain + apply"
            href="/agents/devops"
            description="Summaries of new DevOps tools/approaches and how to use them at work."
          />
          <Panel
            title="THE-COMBINE Updates"
            subtitle="Local companion"
            href="/combine"
            description="See recent updates detected on this computer (later: from GitHub or companion)."
          />
          <Panel
            title="Services"
            subtitle="5+ codebases"
            href="/services"
            description="Track and link to each codebase/service URL (subdomains later)."
          />
          <Panel
            title="Deploy / Restart"
            subtitle="One-click"
            href="/deploy"
            description="Buttons to redeploy the dashboard, agents, and services."
          />
        </div>
      </section>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  href,
  description,
}: {
  title: string;
  subtitle: string;
  href: string;
  description: string;
}) {
  return (
    <Link href={href} className="group rounded-xl border bg-white p-5 hover:bg-neutral-50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-neutral-500">{subtitle}</div>
        </div>
        <div className="text-xs text-neutral-400 group-hover:text-neutral-600">Open →</div>
      </div>
      <p className="mt-2 text-sm text-neutral-600">{description}</p>
    </Link>
  );
}
