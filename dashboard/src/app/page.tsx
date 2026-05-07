import Link from "next/link";
import { prisma } from "@/lib/db";
import { logout } from "@/app/login/actions";
import { addTodo, markDone, togglePinned } from "@/app/todo/actions";
import { runScheduleNow } from "@/app/automations/actions";
import { AskCodex } from "@/app/_components/AskCodex";
import { queueCodexTask } from "@/app/actions";
import { getDevotionalToday } from "@/lib/devotional";

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

function startOfMonth(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dollars(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

type AllsitePeriod = {
  total?: number;
  withIssues?: boolean;
  critical?: unknown[];
  timeline?: Array<Record<string, unknown>>;
};

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
    const summaryJson = (await summaryRes.json().catch(() => null)) as Record<string, unknown> | null;
    const statusJson = statusRes.ok
      ? ((await statusRes.json().catch(() => null)) as Record<string, unknown> | null)
      : null;

    const summary = (summaryJson?.summary as Record<string, unknown> | undefined) ?? null;
    const periods = (summary?.periods as Record<string, unknown> | undefined) ?? null;
    const today = (periods?.today as AllsitePeriod | undefined) ?? null;
    const yesterday = (periods?.yesterday as AllsitePeriod | undefined) ?? null;
    return {
      ok: true as const,
      base,
      hasSnapshot: Boolean(summaryJson?.hasSnapshot),
      periods: periods as unknown,
      today,
      yesterday,
      updateStatus: statusJson,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, base, error: msg };
  }
}

export default async function DashboardHome() {
  const counts = await getCounts();
  const [recentJobs, openTodos, agentRuns, schedules, allsite, activeCodex, lastCodex, devotional] = await Promise.all([
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
    prisma.automationSchedule.findMany({
      where: { key: { in: ["allsite_update", "bizdev_digest", "devops_radar", "todo_triage", "services_ping", "budget_digest", "gmail_triage"] } },
      orderBy: { updatedAt: "desc" },
    }),
    getAllsiteSummary(),
    prisma.agentJob.findFirst({
      where: { kind: "codex", runner: "LOCAL", status: { in: ["QUEUED", "CLAIMED"] } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.agentJob.findFirst({
      where: { kind: "codex", runner: "LOCAL", status: { in: ["SUCCEEDED", "FAILED"] } },
      orderBy: { createdAt: "desc" },
    }),
    getDevotionalToday(new Date()),
  ]);
  const scheduleByKey = new Map(schedules.map((s) => [s.key, s]));

  const monthStart = startOfMonth(new Date());
  const [monthBudget, gmailRun] = await Promise.all([
    prisma.budgetEntry.findMany({ where: { occurredOn: { gte: monthStart } } }),
    prisma.agentRun.findFirst({ where: { agentType: "gmail" }, orderBy: { startedAt: "desc" } }),
  ]);
  const income = monthBudget.filter((e) => e.amountCents > 0).reduce((a, e) => a + e.amountCents, 0);
  const expenses = monthBudget.filter((e) => e.amountCents < 0).reduce((a, e) => a + e.amountCents, 0);
  const net = income + expenses;

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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/inbox">
              Inbox
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/budget">
              Budget
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/automations">
              Automations
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/todo">
              Tasks
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/deploy">
              Deploy
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/ai">
              Jobs
            </Link>
            <Link className="rounded-xl bg-fuchsia-500 px-3 py-2 text-sm font-semibold text-black hover:bg-fuchsia-400" href="/codex">
              Codex
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
              <AgentCard
                title="BizDev (Allsite growth)"
                href="/agents/bizdev"
                context="bizdev"
                last={agentRuns.find((r) => r.agentType === "bizdev") ?? null}
                schedule={scheduleByKey.get("bizdev_digest") ?? null}
                placeholder='Examples: “Find 10 target corporations in PA/OH + decision-maker contacts”, “Draft outreach email + call script”, “What should we pitch next week?”'
              />
              <AgentCard
                title="DevOps Radar (career)"
                href="/agents/devops"
                context="devops"
                last={agentRuns.find((r) => r.agentType === "devops") ?? null}
                schedule={scheduleByKey.get("devops_radar") ?? null}
                placeholder='Examples: “What should I learn this week?”, “Explain a new DevOps trend and how to apply it at my job”, “Give me a 30-minute study plan.”'
              />
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Agent jobs</div>
                  <div className="mt-1 text-sm text-white/70">Non-chat queue + runner status.</div>
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

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Codex</div>
                  <div className="mt-1 text-sm text-white/70">Chat-style LOCAL runs (single in-flight).</div>
                </div>
                <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/codex">
                  Open
                </Link>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/60">
                Active:{" "}
                <span className="text-white/80">
                  {activeCodex
                    ? `${activeCodex.status} • ${activeCodex.createdAt.toISOString().replace("T", " ").slice(0, 19)}`
                    : "—"}
                </span>
              </div>

              {activeCodex?.resultText ? (
                <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
                  {activeCodex.resultText}
                </pre>
              ) : lastCodex?.resultText ? (
                <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80">
                  {lastCodex.resultText}
                </pre>
              ) : null}

              <div className="mt-3">
                <AskCodex title="Ask Codex" action={queueCodexTask} />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Daily devotional</div>
                  <div className="mt-1 text-sm text-white/70">A short biblical teaching for the day.</div>
                </div>
                <div className="text-xs text-white/50">{devotional.source === "thebibleapi" ? "source: web" : "source: offline"}</div>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{devotional.reference}</div>
                <div className="mt-2 text-sm text-white/90">{devotional.text}</div>
                <div className="mt-3 text-xs text-white/60">Takeaway: {devotional.takeaway}</div>
              </div>
              <div className="mt-3">
                <AskCodex
                  title="Ask Codex (apply this)"
                  context="devotional"
                  placeholder='Try: “Help me apply this to my work today”, “Write a short prayer for this”, “Give me a 5-minute reflection.”'
                  action={queueCodexTask}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Budget (this month)</div>
                  <div className="mt-1 text-sm text-white/70">Income, expenses, and net.</div>
                </div>
                <Link className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90" href="/budget">
                  Open
                </Link>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Income</div>
                  <div className="mt-1 text-lg font-semibold">{dollars(income)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Expenses</div>
                  <div className="mt-1 text-lg font-semibold">{dollars(expenses)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Net</div>
                  <div className="mt-1 text-lg font-semibold">{dollars(net)}</div>
                </div>
              </div>
              <div className="mt-4">
                <AskCodex title="Ask Codex (budget)" context="budget" action={queueCodexTask} />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Inbox (Gmail)</div>
                  <div className="mt-1 text-sm text-white/70">Triage and turn important items into tasks.</div>
                </div>
                <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/inbox">
                  Open
                </Link>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/60">
                Last triage: {gmailRun ? gmailRun.startedAt.toISOString().replace("T", " ").slice(0, 19) : "—"}
              </div>
              <div className="mt-4">
                <AskCodex title="Ask Codex (gmail)" context="gmail" action={queueCodexTask} />
              </div>
              <div className="mt-3 text-xs text-white/50">
                Schedule it in Automations → “Gmail inbox triage” (runs when your laptop companion is connected).
              </div>
            </div>

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
                    <div className="flex items-center gap-2">
                      {scheduleByKey.get("allsite_update") ? (
                        <form action={runScheduleNow.bind(null, scheduleByKey.get("allsite_update")!.id)}>
                          <button className="rounded-xl bg-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-fuchsia-400">
                            Run now
                          </button>
                        </form>
                      ) : (
                        <Link className="text-xs text-white/70 hover:text-white" href="/automations">
                          Schedule →
                        </Link>
                      )}
                      <a
                        className="text-xs text-white/70 hover:text-white"
                        href={`${allsite.base.replace(/\/$/, "")}/api/update`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Update page →
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-white/70">Couldn’t load hub summary: {allsite.error}</div>
                )}
                {allsite.ok && allsite.updateStatus ? (
                  <div className="mt-2 text-xs text-white/60">
                    Update: {String(allsite.updateStatus.state ?? "—")} {allsite.updateStatus.running ? "(running)" : ""}
                  </div>
                ) : null}
                {scheduleByKey.get("allsite_update") ? (
                  <div className="mt-1 text-xs text-white/50">
                    Automation:{" "}
                    {scheduleByKey.get("allsite_update")!.enabled ? "on" : "off"} • next{" "}
                    {scheduleByKey.get("allsite_update")!.nextRunAt
                      ? scheduleByKey
                          .get("allsite_update")!
                          .nextRunAt!.toISOString()
                          .replace("T", " ")
                          .slice(0, 19)
                      : "—"}
                  </div>
                ) : null}
              </div>

              {allsite.ok ? (
                <div className="mt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Today</div>
                      <div className="mt-1 text-2xl font-semibold">{String(allsite.today?.total ?? 0)}</div>
                      <div className="mt-1 text-xs text-white/60">
                        issues: {allsite.today?.withIssues ? "yes" : "no"} • critical: {String(allsite.today?.critical?.length ?? 0)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Yesterday</div>
                      <div className="mt-1 text-2xl font-semibold">{String(allsite.yesterday?.total ?? 0)}</div>
                      <div className="mt-1 text-xs text-white/60">
                        issues: {allsite.yesterday?.withIssues ? "yes" : "no"} • critical: {String(allsite.yesterday?.critical?.length ?? 0)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Today (latest)</div>
                    <div className="mt-2 grid gap-2">
                      {Array.isArray(allsite.today?.timeline) && allsite.today.timeline.length > 0 ? (
                        allsite.today.timeline.slice(0, 6).map((t: Record<string, unknown>, idx: number) => (
                          <div key={idx} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="truncate text-sm font-medium">{String(t.site ?? "Site")}</div>
                              <div className="text-xs text-white/60">{Boolean(t.suspect) ? "⚠︎" : "OK"}</div>
                            </div>
                            <div className="mt-1 text-xs text-white/50">
                              {String(t.vendor ?? "")} • {String(t.formName ?? "")}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-white/60">No submissions yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <AskCodex
                      title="Ask Codex (allsite)"
                      context="allsite"
                      placeholder='Examples: “Summarize issues from today’s submissions”, “List critical sites to follow up”, “Draft a message to a vendor about missing photos.”'
                      action={queueCodexTask}
                    />
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

function AgentCard({
  title,
  href,
  context,
  placeholder,
  last,
  schedule,
}: {
  title: string;
  href: string;
  context: string;
  placeholder: string;
  last: { status: string; startedAt: Date; outputMarkdown: string | null } | null;
  schedule: { id: string; enabled: boolean; nextRunAt: Date | null } | null;
}) {
  const preview =
    (last?.outputMarkdown ?? "").trim().split(/\r?\n/).filter(Boolean).slice(0, 6).join("\n") || "No runs yet.";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs text-white/60">{last ? `${last.status} • ${last.startedAt.toISOString()}` : "—"}</div>
          {schedule ? (
            <div className="mt-1 text-xs text-white/50">
              Automation: {schedule.enabled ? "on" : "off"} • next{" "}
              {schedule.nextRunAt ? schedule.nextRunAt.toISOString().replace("T", " ").slice(0, 19) : "—"}
            </div>
          ) : (
            <div className="mt-1 text-xs text-white/50">Automation: not scheduled</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10" href={href}>
            Open
          </Link>
          <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10" href="/automations">
            Schedule
          </Link>
        </div>
      </div>

      <pre className="mt-4 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/80">
        {preview}
      </pre>

      <div className="mt-4">
        <AskCodex title="Ask Codex" context={context} placeholder={placeholder} action={queueCodexTask} />
      </div>
    </div>
  );
}
