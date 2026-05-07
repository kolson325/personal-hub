import Link from "next/link";
import { prisma } from "@/lib/db";
import { logout } from "@/app/login/actions";
import { addTodo, markDone, togglePinned } from "@/app/todo/actions";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [openTodos, queuedJobs] = await Promise.all([
    prisma.todoItem.count({ where: { status: "OPEN" } }),
    prisma.agentJob.count({ where: { status: "QUEUED" } }),
  ]);
  return { openTodos, queuedJobs };
}

function formatToday() {
  const now = new Date();
  return now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

async function getAllsiteSummary() {
  const base = process.env.ALLSITE_CENTRAL_HUB_URL ?? "https://allsitefacilities-centralhub.loca.lt";
  const url = new URL("/api/summary", base).toString();
  const statusUrl = new URL("/api/update/status", base).toString();
  try {
    const [summaryRes, statusRes] = await Promise.all([
      fetch(url, { cache: "no-store" }),
      fetch(statusUrl, { cache: "no-store" }),
    ]);
    if (!summaryRes.ok) throw new Error(`summary HTTP ${summaryRes.status}`);
    const summaryJson = (await summaryRes.json().catch(() => null)) as any;
    const statusJson = statusRes.ok ? ((await statusRes.json().catch(() => null)) as any) : null;
    return {
      ok: true as const,
      base,
      hasSnapshot: Boolean(summaryJson?.hasSnapshot),
      summary: Array.isArray(summaryJson?.summary) ? summaryJson.summary : [],
      updateStatus: statusJson,
    };
  } catch (e) {
    return { ok: false as const, base, error: String((e as any)?.message ?? e) };
  }
}

export default async function DashboardHome() {
  const counts = await getCounts();
  const [recentJobs, openTodos, agentRuns, allsite] = await Promise.all([
    prisma.agentJob.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.todoItem.findMany({
      where: { status: "OPEN" },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.agentRun.findMany({
      where: { agentType: { in: ["bizdev", "devops"] } },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    getAllsiteSummary(),
  ]);

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight">Kolson’s Dashboard</h1>
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70 sm:inline">
                {formatToday()}
              </span>
            </div>
            <p className="mt-1 text-sm text-white/70">
              Morning brief, automations, agents, and deploy controls.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/automations">
              Automations
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/deploy">
              Deploy
            </Link>
            <Link className="rounded-xl bg-fuchsia-500 px-3 py-2 text-sm font-semibold text-black hover:bg-fuchsia-400" href="/ai">
              AI
            </Link>
            <form action={logout}>
              <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white/90">Today</div>
                  <div className="mt-1 text-sm text-white/70">
                    {counts.openTodos} open tasks • {counts.queuedJobs} queued jobs
                  </div>
                </div>
                <div className="hidden text-xs text-white/60 sm:block">
                  Tip: keep it small, keep it moving.
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Quick add</div>
                  <form action={addTodo} className="mt-2 grid gap-2">
                    <input
                      name="title"
                      placeholder="Add a task…"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                    />
                    <input
                      name="notes"
                      placeholder="Notes (optional)"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                    />
                    <button className="w-fit rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
                      Add
                    </button>
                  </form>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Open tasks</div>
                    <Link className="text-xs text-white/70 hover:text-white" href="/todo">
                      Manage →
                    </Link>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {openTodos.length === 0 ? (
                      <li className="text-sm text-white/60">No open tasks.</li>
                    ) : (
                      openTodos.map((t) => (
                        <li key={t.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{t.title}</div>
                              {t.notes ? (
                                <div className="mt-1 line-clamp-2 text-sm text-white/70">{t.notes}</div>
                              ) : null}
                              <div className="mt-2 text-xs text-white/50">{t.pinned ? "Pinned" : "—"}</div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2">
                              <form action={togglePinned.bind(null, t.id)}>
                                <button className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10">
                                  {t.pinned ? "Unpin" : "Pin"}
                                </button>
                              </form>
                              <form action={markDone.bind(null, t.id)}>
                                <button className="rounded-xl bg-fuchsia-500 px-2 py-1 text-xs font-semibold text-black hover:bg-fuchsia-400">
                                  Done
                                </button>
                              </form>
                            </div>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Agents</div>
                    <div className="mt-1 text-sm text-white/70">Runs + highlights (scheduling coming next).</div>
                  </div>
                  <Link className="text-xs text-white/70 hover:text-white" href="/automations">
                    Schedule →
                  </Link>
                </div>

                <div className="mt-4 grid gap-3">
                  <AgentMini
                    title="BizDev"
                    href="/agents/bizdev"
                    last={agentRuns.find((r) => r.agentType === "bizdev") ?? null}
                  />
                  <AgentMini
                    title="DevOps Radar"
                    href="/agents/devops"
                    last={agentRuns.find((r) => r.agentType === "devops") ?? null}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Agent jobs</div>
                    <div className="mt-1 text-sm text-white/70">Queue + runner status.</div>
                  </div>
                  <Link className="text-xs text-white/70 hover:text-white" href="/ai">
                    View →
                  </Link>
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {recentJobs.length === 0 ? (
                    <li className="text-white/60">No jobs yet.</li>
                  ) : (
                    recentJobs.map((j) => (
                      <li key={j.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                        <span className="truncate pr-3">{j.kind}</span>
                        <span className="text-xs text-white/60">{j.status}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Allsite hub (site photos)</div>
                  <div className="mt-1 text-sm text-white/70">Live data + snapshot status.</div>
                </div>
                <div className="flex gap-2">
                  <a
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                    href={process.env.ALLSITE_CENTRAL_HUB_URL ?? "https://allsitefacilities-centralhub.loca.lt"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                  <Link className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90" href="/central-hub">
                    Embed
                  </Link>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                {allsite.ok ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-white/80">
                      Snapshot:{" "}
                      <span className={allsite.hasSnapshot ? "text-emerald-300" : "text-amber-300"}>
                        {allsite.hasSnapshot ? "available" : "missing"}
                      </span>
                    </div>
                    <a className="text-xs text-white/70 hover:text-white" href={`${allsite.base.replace(/\/$/, "")}/api/update`} target="_blank" rel="noreferrer">
                      Run update →
                    </a>
                  </div>
                ) : (
                  <div className="text-sm text-white/70">Couldn’t load hub summary: {allsite.error}</div>
                )}
                {allsite.ok && allsite.updateStatus ? (
                  <div className="mt-2 text-xs text-white/60">
                    Update: {String(allsite.updateStatus.state ?? "—")} {allsite.updateStatus.running ? "(running)" : ""}
                  </div>
                ) : null}
              </div>

              {allsite.ok ? (
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Summary</div>
                  <div className="mt-2 grid gap-2">
                    {allsite.summary.length === 0 ? (
                      <div className="text-sm text-white/60">No summary yet.</div>
                    ) : (
                      allsite.summary.slice(0, 8).map((row: any, idx: number) => (
                        <div key={idx} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="truncate text-sm font-medium">{String(row.site ?? row.name ?? "Site")}</div>
                            <div className="text-xs text-white/60">{String(row.count ?? row.total ?? "")}</div>
                          </div>
                          {row.latest ? <div className="mt-1 text-xs text-white/50">latest: {String(row.latest)}</div> : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Deploy / restart</div>
                  <div className="mt-1 text-sm text-white/70">One-click redeploy via the VPS worker.</div>
                </div>
                <Link className="text-xs text-white/70 hover:text-white" href="/deploy">
                  Open →
                </Link>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10" href="/deploy">
                  Queue redeploy
                </Link>
                <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10" href="/services">
                  Services
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function AgentMini({
  title,
  href,
  last,
}: {
  title: string;
  href: string;
  last: { status: string; startedAt: Date; outputMarkdown: string | null } | null;
}) {
  const preview =
    (last?.outputMarkdown ?? "").trim().split(/\r?\n/).filter(Boolean).slice(0, 3).join("\n") || "No runs yet.";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs text-white/60">
            {last ? `${last.status} • ${last.startedAt.toISOString()}` : "—"}
          </div>
        </div>
        <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10" href={href}>
          Open
        </Link>
      </div>
      <pre className="mt-3 line-clamp-6 whitespace-pre-wrap text-xs text-white/70">{preview}</pre>
    </div>
  );
}
