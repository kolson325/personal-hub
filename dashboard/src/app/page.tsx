import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { logout } from "@/app/login/actions";
import { addTodo, markDone, togglePinned } from "@/app/todo/actions";
import { runScheduleNow } from "@/app/automations/actions";
import { AskCodex } from "@/app/_components/AskCodex";
import { queueCodexTask } from "@/app/actions";
import { getDevotionalToday } from "@/lib/devotional";
import { getGridLayout, resetGridLayout, saveGridLayout, type PanelId } from "@/app/layout/actions";
import { GridLayoutEditor } from "@/app/_components/GridLayoutEditor";
import { PanelCard } from "@/app/_components/PanelCard";
import { RunAgent } from "@/app/_components/RunAgent";
import { runBizDevAgent } from "@/app/agents/bizdev/actions";
import { runDevOpsAgent } from "@/app/agents/devops/actions";
import { AGENT_PROFILE_BY_ID } from "@/lib/agent-profiles";

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

function cleanSnippet(value: string | null | undefined, max = 180) {
  const clean = String(value ?? "")
    .replace(/[#*_`>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "No report yet.";
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
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

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const edit = String(params.edit ?? "") === "1";
  const PANEL_IDS: PanelId[] = ["today", "codex", "devotional", "allsite", "bizdev", "devops", "budget", "inbox", "jobs", "deploy"];
  const counts = await getCounts();
  const [recentJobs, openTodos, agentRuns, schedules, allsite, activeCodex, lastCodex, devotional, gridLayout] = await Promise.all([
    prisma.agentJob.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.todoItem.findMany({
      where: { status: "OPEN" },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 40,
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
    getGridLayout(),
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
  const latestRun = (agentType: string) => agentRuns.find((r) => r.agentType === agentType) ?? null;
  const preview = (agentType: string, fallback = "No reports yet.") =>
    (latestRun(agentType)?.outputMarkdown ?? "").trim().split(/\r?\n/).filter(Boolean).slice(0, 10).join("\n") || fallback;
  const bizdevLast = latestRun("bizdev");
  const devopsLast = latestRun("devops");
  const budgetLast = latestRun("budget");
  const allsiteLast = latestRun("allsite");
  const devotionalLast = latestRun("devotional");
  const gmailLatest = latestRun("gmail") ?? gmailRun;
  const bizdevPreview = preview("bizdev");
  const devopsPreview = preview("devops");

  let activeAgentType: string | null = null;
  let activeContext: string | null = null;
  try {
    const payload = activeCodex?.payloadJson ? (JSON.parse(activeCodex.payloadJson) as Record<string, unknown>) : null;
    activeAgentType = payload && typeof payload.agentType === "string" ? payload.agentType : null;
    activeContext = payload && typeof payload.context === "string" ? payload.context : null;
  } catch {
    activeAgentType = null;
    activeContext = null;
  }
  const bizdevLive = activeCodex && (activeAgentType === "bizdev" || activeContext === "bizdev") ? (activeCodex.resultText ?? "") : null;
  const devopsLive = activeCodex && (activeAgentType === "devops" || activeContext === "devops") ? (activeCodex.resultText ?? "") : null;
  const commandAgents = ["bizdev", "devops", "budget", "allsite", "gmail", "todo"].map((id) => ({
    id,
    profile: AGENT_PROFILE_BY_ID.get(id),
    run: latestRun(id),
    active: activeAgentType === id || activeContext === id,
  }));

  const panels: Partial<Record<PanelId, ReactNode>> = {
    today: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="Today"
          subtitle={`${counts.openTodos} open tasks • ${counts.queuedJobs} queued jobs`}
          right={<div className="hidden text-xs text-white/60 sm:block">Tip: keep it small, keep it moving.</div>}
        >
          <div className="grid gap-3 md:grid-cols-2">
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
                          {t.notes ? <div className="mt-1 line-clamp-2 text-sm text-white/70">{t.notes}</div> : null}
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

          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Agent command board</div>
              <Link className="text-xs text-white/70 hover:text-white" href="/automations">
                Schedule →
              </Link>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {commandAgents.map(({ id, profile, run, active }) => (
                <Link
                  key={id}
                  href={`/agents/${id}`}
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.07]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium">{profile?.shortTitle ?? id}</div>
                    <span className={active ? "text-xs text-emerald-300" : "text-xs text-white/45"}>
                      {active ? "running" : run?.status ?? "idle"}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-white/55">
                    {run?.outputMarkdown ? run.outputMarkdown.replace(/\s+/g, " ").slice(0, 130) : profile?.mission}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </PanelCard>
      </div>
    ),
    bizdev: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="BizDev (Allsite growth)"
          subtitle="Targets + outreach drafts."
          right={
            <div className="flex gap-2">
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/agents/bizdev">
                Open
              </Link>
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/automations">
                Schedule
              </Link>
            </div>
          }
        >
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/60">
            Last report:{" "}
            <span className="text-white/80">
              {bizdevLast ? `${bizdevLast.status} • ${bizdevLast.startedAt.toISOString().replace("T", " ").slice(0, 19)}` : "—"}
            </span>
            {scheduleByKey.get("bizdev_digest") ? (
              <div className="mt-1 text-xs text-white/50">
                Automation: {scheduleByKey.get("bizdev_digest")!.enabled ? "on" : "off"} • next{" "}
                {scheduleByKey.get("bizdev_digest")!.nextRunAt
                  ? scheduleByKey.get("bizdev_digest")!.nextRunAt!.toISOString().replace("T", " ").slice(0, 19)
                  : "—"}
              </div>
            ) : (
              <div className="mt-1 text-xs text-white/50">Automation: not scheduled</div>
            )}
          </div>

          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {bizdevLive != null ? (bizdevLive.trim() ? bizdevLive : "Queued…") : bizdevPreview}
          </pre>

          <div className="mt-3">
            <RunAgent
              title="Run BizDev report"
              fieldName="notes"
              fieldPlaceholder='Optional notes (e.g., “focus on Western PA corporate campuses”, “prioritize woke brands”, “draft calls for facilities managers”)'
              actionLabel="Run"
              action={runBizDevAgent}
            />
          </div>

          <div className="mt-3">
            <AskCodex
              title="Ask Codex (bizdev)"
              context="bizdev"
              placeholder='Examples: “Find 10 multi-site targets in PA/OH + decision-maker contacts”, “Draft outreach email + call script”, “What should we pitch next week?”'
              action={queueCodexTask}
            />
          </div>
        </PanelCard>
      </div>
    ),
    devops: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="DevOps Radar (career)"
          subtitle="New tech + implementation steps."
          right={
            <div className="flex gap-2">
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/agents/devops">
                Open
              </Link>
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/automations">
                Schedule
              </Link>
            </div>
          }
        >
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/60">
            Last report:{" "}
            <span className="text-white/80">
              {devopsLast ? `${devopsLast.status} • ${devopsLast.startedAt.toISOString().replace("T", " ").slice(0, 19)}` : "—"}
            </span>
            {scheduleByKey.get("devops_radar") ? (
              <div className="mt-1 text-xs text-white/50">
                Automation: {scheduleByKey.get("devops_radar")!.enabled ? "on" : "off"} • next{" "}
                {scheduleByKey.get("devops_radar")!.nextRunAt
                  ? scheduleByKey.get("devops_radar")!.nextRunAt!.toISOString().replace("T", " ").slice(0, 19)
                  : "—"}
              </div>
            ) : (
              <div className="mt-1 text-xs text-white/50">Automation: not scheduled</div>
            )}
          </div>

          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
            {devopsLive != null ? (devopsLive.trim() ? devopsLive : "Queued…") : devopsPreview}
          </pre>

          <div className="mt-3">
            <RunAgent
              title="Run DevOps report"
              fieldName="focus"
              fieldPlaceholder='Optional focus (e.g., “Backstage 2026 best practices”, “Octopus deploy patterns”, “OpenTelemetry rollout”)'
              actionLabel="Run"
              action={runDevOpsAgent}
            />
          </div>

          <div className="mt-3">
            <AskCodex
              title="Ask Codex (devops)"
              context="devops"
              placeholder='Examples: “What should I learn this week?”, “Explain a new DevOps trend and how to apply it at my job”, “Give me a 30-minute study plan.”'
              action={queueCodexTask}
            />
          </div>
        </PanelCard>
      </div>
    ),
    jobs: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="Agent jobs"
          subtitle="Non-chat queue + runner status."
          right={
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/ai">
              Open
            </Link>
          }
        >
          <ul className="space-y-2 text-sm">
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
        </PanelCard>
      </div>
    ),
    codex: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="Codex"
          subtitle="Chat-style LOCAL runs (single in-flight)."
          right={
            <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/codex">
              Open
            </Link>
          }
        >
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/60">
            Active:{" "}
            <span className="text-white/80">
              {activeCodex ? `${activeCodex.status} • ${activeCodex.createdAt.toISOString().replace("T", " ").slice(0, 19)}` : "—"}
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
        </PanelCard>
      </div>
    ),
    devotional: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="Daily devotional"
          subtitle="A short biblical teaching for the day."
          right={
            <div className="flex items-center gap-2">
              <div className="text-xs text-white/50">{devotional.source === "thebibleapi" ? "source: web" : "source: offline"}</div>
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/agents/devotional">
                Agent
              </Link>
            </div>
          }
        >
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{devotional.reference}</div>
            <div className="mt-2 text-sm text-white/90">{devotional.text}</div>
            <div className="mt-3 text-xs text-white/60">Takeaway: {devotional.takeaway}</div>
          </div>
          <div className="mt-3">
            {devotionalLast?.outputMarkdown ? (
              <pre className="mb-3 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                {devotionalLast.outputMarkdown}
              </pre>
            ) : null}
            <AskCodex
              title="Ask Codex (apply this)"
              context="devotional"
              placeholder='Try: “Help me apply this to my work today”, “Write a short prayer for this”, “Give me a 5-minute reflection.”'
              action={queueCodexTask}
            />
          </div>
        </PanelCard>
      </div>
    ),
    allsite: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="Allsite hub (site photos)"
          subtitle="Live data + snapshot status."
          right={
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
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/agents/allsite">
                Agent
              </Link>
            </div>
          }
        >
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
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
                Automation: {scheduleByKey.get("allsite_update")!.enabled ? "on" : "off"} • next{" "}
                {scheduleByKey.get("allsite_update")!.nextRunAt
                  ? scheduleByKey.get("allsite_update")!.nextRunAt!.toISOString().replace("T", " ").slice(0, 19)
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
                    issues: {allsite.yesterday?.withIssues ? "yes" : "no"} • critical:{" "}
                    {String(allsite.yesterday?.critical?.length ?? 0)}
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
                {allsiteLast?.outputMarkdown ? (
                  <pre className="mb-4 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-50">
                    {allsiteLast.outputMarkdown}
                  </pre>
                ) : null}
                <AskCodex
                  title="Ask Codex (allsite)"
                  context="allsite"
                  placeholder='Examples: “Summarize issues from today’s submissions”, “List critical sites to follow up”, “Draft a message to a vendor about missing photos.”'
                  action={queueCodexTask}
                />
              </div>
            </div>
          ) : null}
        </PanelCard>
      </div>
    ),
    budget: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="Budget (this month)"
          subtitle="Income, expenses, and net."
          right={
            <div className="flex gap-2">
              <Link className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90" href="/budget">
                Open
              </Link>
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/agents/budget">
                Agent
              </Link>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
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
            {budgetLast?.outputMarkdown ? (
              <pre className="mb-4 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                {budgetLast.outputMarkdown}
              </pre>
            ) : null}
            <AskCodex title="Ask Codex (budget)" context="budget" action={queueCodexTask} />
          </div>
        </PanelCard>
      </div>
    ),
    inbox: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard
          title="Inbox (Gmail)"
          subtitle="Triage and turn important items into tasks."
          right={
            <div className="flex gap-2">
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/inbox">
                Open
              </Link>
              <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/agents/gmail">
                Agent
              </Link>
            </div>
          }
        >
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/60">
            Last triage: {gmailLatest ? gmailLatest.startedAt.toISOString().replace("T", " ").slice(0, 19) : "—"}
          </div>
          <div className="mt-4">
            {gmailLatest?.outputMarkdown ? (
              <pre className="mb-4 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                {gmailLatest.outputMarkdown}
              </pre>
            ) : null}
            <AskCodex title="Ask Codex (gmail)" context="gmail" action={queueCodexTask} />
          </div>
          <div className="mt-3 text-xs text-white/50">
            Schedule it in Automations → “Gmail inbox triage” (runs when your laptop companion is connected).
          </div>
        </PanelCard>
      </div>
    ),
    deploy: (
      <div className="h-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <PanelCard title="Deploy / restart" subtitle="One-click redeploy via the VPS worker.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10" href="/deploy">
              Queue redeploy
            </Link>
            <Link className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm hover:bg-white/10" href="/services">
              Services
            </Link>
          </div>
          <div className="mt-3">
            <Link className="text-xs text-white/70 hover:text-white" href="/deploy">
              Open deploy page →
            </Link>
          </div>
        </PanelCard>
      </div>
    ),
  };
  const mobileNavItems: Array<{ id: PanelId; label: string }> = [
    { id: "today", label: "Today" },
    { id: "bizdev", label: "BizDev" },
    { id: "devops", label: "DevOps" },
    { id: "allsite", label: "Allsite" },
    { id: "budget", label: "Money" },
    { id: "inbox", label: "Inbox" },
  ];
  const mobilePrimaryAgents = [
    { id: "bizdev", label: "BizDev", href: "/agents/bizdev", run: bizdevLast, accent: "from-fuchsia-500/22 to-amber-500/10" },
    { id: "devops", label: "DevOps", href: "/agents/devops", run: devopsLast, accent: "from-sky-500/20 to-fuchsia-500/10" },
    { id: "allsite", label: "Allsite", href: "/agents/allsite", run: allsiteLast, accent: "from-emerald-500/20 to-sky-500/10" },
  ];

  return (
    <main id="mobile-top" className="min-h-screen">
      <header className="hidden border-b border-white/10 bg-zinc-950/88 backdrop-blur-xl sm:sticky sm:top-0 sm:z-20 sm:block">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">Kolson’s Dashboard</h1>
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70 sm:inline">
                {formatToday()}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs text-white/70 sm:text-sm">
              Morning brief, automations, agents, and deploy controls.
            </p>
          </div>
          <div className="no-scrollbar -mx-1 flex max-w-full items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:max-w-[75vw] sm:shrink-0 sm:pb-0">
            <Link className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10" href="/inbox">
              Inbox
            </Link>
            <Link className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10" href="/budget">
              Budget
            </Link>
            <Link className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10" href="/automations">
              Automations
            </Link>
            <Link className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10" href="/todo">
              Tasks
            </Link>
            <Link className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10" href="/deploy">
              Deploy
            </Link>
            <Link className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10" href="/ai">
              Jobs
            </Link>
            <Link className="min-h-10 shrink-0 rounded-xl bg-fuchsia-500 px-3 py-2.5 text-sm font-semibold text-black hover:bg-fuchsia-400" href="/codex">
              Codex
            </Link>
            {/* Use a plain anchor here to force a full navigation so query params reliably apply in Safari. */}
            <a
              className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10"
              href={edit ? "/" : "/?edit=1"}
            >
              {edit ? "Done editing" : "Edit layout"}
            </a>
            <form action={logout}>
              <button className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/92 px-3 py-3 backdrop-blur-xl sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold tracking-tight">Kolson Command</div>
            <div className="mt-0.5 text-xs text-white/55">{formatToday()} • {counts.openTodos} tasks • {counts.queuedJobs} queued</div>
          </div>
          <Link className="min-h-10 shrink-0 rounded-2xl bg-fuchsia-500 px-4 py-2.5 text-sm font-bold text-black" href="/codex">
            Codex
          </Link>
        </div>
        <nav className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {mobileNavItems.map((item) => (
            <a
              key={item.id}
              href={`#mobile-${item.id}`}
              className="min-h-9 shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/80"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <section className="hidden mx-auto max-w-6xl px-3 py-4 sm:block sm:px-6 sm:py-6">
        <GridLayoutEditor
          edit={edit}
          allowedIds={PANEL_IDS}
          initialLayout={gridLayout}
          onSave={saveGridLayout}
          onReset={resetGridLayout}
          panels={panels}
        />
      </section>

      <section className="grid gap-4 px-3 pb-28 pt-4 sm:hidden">
        <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-fuchsia-500/20 via-white/[0.08] to-amber-500/10 p-4 shadow-2xl shadow-black/30">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-100/75">Mobile view</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Command center</h1>
          <p className="mt-2 text-sm leading-6 text-white/68">
            Built for quick checks: read the latest reports, jump to the right agent, then move.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-lg font-semibold">{counts.openTodos}</div>
              <div className="text-[11px] text-white/50">tasks</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-lg font-semibold">{agentRuns.filter((run) => run.status === "running").length}</div>
              <div className="text-[11px] text-white/50">running</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-lg font-semibold">{agentRuns.filter((run) => run.status === "succeeded").length}</div>
              <div className="text-[11px] text-white/50">reports</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link className="min-h-12 rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-black" href="/codex">
              Ask Codex
            </Link>
            <Link className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-center text-sm font-bold text-white" href="/automations">
              Automations
            </Link>
          </div>
        </div>

        <section id="mobile-today" className="scroll-mt-32 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Today</h2>
              <p className="mt-1 text-xs text-white/55">Capture a task without losing momentum.</p>
            </div>
            <Link className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold" href="/todo">
              Tasks
            </Link>
          </div>
          <form action={addTodo} className="mt-4 grid gap-2">
            <input
              name="title"
              placeholder="Add a task…"
              className="min-h-12 rounded-2xl border border-white/10 bg-black/35 px-4 text-base text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-fuchsia-500/50"
            />
            <button className="min-h-12 rounded-2xl bg-white px-4 text-sm font-bold text-black">Add task</button>
          </form>
          <div className="mt-4 grid gap-2">
            {openTodos.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">No open tasks.</div>
            ) : (
              openTodos.slice(0, 3).map((task) => (
                <div key={task.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="line-clamp-1 text-sm font-medium">{task.title}</div>
                  {task.notes ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{task.notes}</div> : null}
                </div>
              ))
            )}
          </div>
        </section>

        <section id="mobile-bizdev" className="scroll-mt-32 grid gap-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <h2 className="text-base font-semibold">Agent reports</h2>
              <p className="mt-1 text-xs text-white/55">The daily assistants replacing “go research this.”</p>
            </div>
            <Link className="text-xs font-semibold text-white/65" href="/automations">
              Schedule →
            </Link>
          </div>
          {mobilePrimaryAgents.map((agent) => (
            <Link
              key={agent.id}
              href={agent.href}
              className={`rounded-[1.5rem] border border-white/10 bg-gradient-to-br ${agent.accent} p-4 shadow-xl shadow-black/20 active:scale-[0.99]`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold">{agent.label}</div>
                <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-white/65">
                  {agent.run?.status ?? "idle"}
                </span>
              </div>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-white/75">
                {cleanSnippet(agent.run?.outputMarkdown, 260)}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs font-semibold text-white/65">
                <span>{agent.run ? agent.run.startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No run"}</span>
                <span>Open report →</span>
              </div>
            </Link>
          ))}
        </section>

        <section id="mobile-devops" className="scroll-mt-32 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">All agents</h2>
              <p className="mt-1 text-xs text-white/55">Tap any assistant to open its report page.</p>
            </div>
            <Link className="rounded-full bg-fuchsia-500 px-3 py-2 text-xs font-bold text-black" href="/codex">
              Ask
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {commandAgents.map(({ id, profile, run, active }) => (
              <Link key={id} href={`/agents/${id}`} className="rounded-2xl border border-white/10 bg-black/20 p-3 active:scale-[0.99]">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold">{profile?.shortTitle ?? id}</div>
                  <span className={active ? "text-[11px] text-emerald-300" : "text-[11px] text-white/45"}>
                    {active ? "on" : run?.status ?? "idle"}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{cleanSnippet(run?.outputMarkdown ?? profile?.mission, 90)}</div>
              </Link>
            ))}
          </div>
        </section>

        <section id="mobile-allsite" className="scroll-mt-32 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Allsite</h2>
              <p className="mt-1 text-xs text-white/55">Site photos, issues, and follow-up signals.</p>
            </div>
            <Link className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold" href="/central-hub">
              Hub
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-white/45">Today</div>
              <div className="mt-1 text-2xl font-semibold">{allsite.ok ? String(allsite.today?.total ?? 0) : "—"}</div>
              <div className="mt-1 text-xs text-white/50">critical {allsite.ok ? String(allsite.today?.critical?.length ?? 0) : "—"}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-white/45">Snapshot</div>
              <div className={allsite.ok && allsite.hasSnapshot ? "mt-1 text-lg font-semibold text-emerald-300" : "mt-1 text-lg font-semibold text-amber-300"}>
                {allsite.ok && allsite.hasSnapshot ? "Ready" : "Check"}
              </div>
              <div className="mt-1 text-xs text-white/50">{allsite.ok ? String(allsite.updateStatus?.state ?? "idle") : "offline"}</div>
            </div>
          </div>
          <p className="mt-4 line-clamp-4 text-sm leading-6 text-white/70">{cleanSnippet(allsiteLast?.outputMarkdown, 250)}</p>
        </section>

        <section id="mobile-budget" className="scroll-mt-32 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Money</h2>
              <p className="mt-1 text-xs text-white/55">Month-to-date snapshot.</p>
            </div>
            <Link className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold" href="/budget">
              Budget
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] text-white/45">Income</div>
              <div className="mt-1 text-sm font-semibold">{dollars(income)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] text-white/45">Spend</div>
              <div className="mt-1 text-sm font-semibold">{dollars(expenses)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] text-white/45">Net</div>
              <div className="mt-1 text-sm font-semibold">{dollars(net)}</div>
            </div>
          </div>
          <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/70">{cleanSnippet(budgetLast?.outputMarkdown, 220)}</p>
        </section>

        <section id="mobile-inbox" className="scroll-mt-32 grid gap-3">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Inbox</h2>
                <p className="mt-1 text-xs text-white/55">Triage result and next email action.</p>
              </div>
              <Link className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold" href="/agents/gmail">
                Agent
              </Link>
            </div>
            <p className="mt-4 line-clamp-4 text-sm leading-6 text-white/70">{cleanSnippet(gmailLatest?.outputMarkdown, 260)}</p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-fuchsia-500/10 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/45">{devotional.reference}</div>
            <p className="mt-2 line-clamp-4 text-sm leading-6 text-white/80">{devotional.text}</p>
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/65">
              {devotional.takeaway}
            </div>
          </div>
        </section>

        <section className="scroll-mt-32 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
          <h2 className="text-base font-semibold">System</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-sm font-semibold" href="/ai">
              Jobs
            </Link>
            <Link className="min-h-12 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-sm font-semibold" href="/deploy">
              Deploy
            </Link>
          </div>
          <div className="mt-3 grid gap-2">
            {recentJobs.slice(0, 3).map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                <span>{job.kind}</span>
                <span className="text-white/50">{job.status}</span>
              </div>
            ))}
          </div>
        </section>
      </section>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-[1.65rem] border border-white/10 bg-zinc-950/88 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl sm:hidden">
        <a className="rounded-2xl px-2 py-2.5 text-center text-[11px] font-semibold text-white/75 active:bg-white/10" href="#mobile-top">
          Home
        </a>
        <a className="rounded-2xl px-2 py-2.5 text-center text-[11px] font-semibold text-white/75 active:bg-white/10" href="#mobile-bizdev">
          Agents
        </a>
        <Link className="rounded-2xl bg-fuchsia-500 px-2 py-2.5 text-center text-[11px] font-bold text-black" href="/codex">
          Codex
        </Link>
        <Link className="rounded-2xl px-2 py-2.5 text-center text-[11px] font-semibold text-white/75 active:bg-white/10" href="/todo">
          Tasks
        </Link>
        <Link className="rounded-2xl px-2 py-2.5 text-center text-[11px] font-semibold text-white/75 active:bg-white/10" href="/budget">
          Money
        </Link>
      </nav>
    </main>
  );
}
