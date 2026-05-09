"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getDevotionalToday } from "@/lib/devotional";
import { getAgentMemoryMarkdown } from "@/lib/agent-memory";
import { isKnownAgentId } from "@/lib/agent-profiles";

export type CodexQueueState =
  | { ok: true; jobId: string }
  | { ok: false; error: string; activeJobId?: string };

const PERSONAL_GOALS = [
  "Money (income, savings, leverage)",
  "Career (DevOps growth, skill-building, impact)",
  "Allsite growth (wins, customer expansion, execution)",
  "Health (training, sleep, nutrition, stress)",
  "Relationship with God (prayer, obedience, character)",
];

function clampText(s: string, max = 12000) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…(truncated)…`;
}

async function fetchAllsitePanel() {
  const base = process.env.ALLSITE_CENTRAL_HUB_URL ?? "";
  if (!base) return null;
  try {
    const summaryUrl = new URL("/api/summary", base).toString();
    const statusUrl = new URL("/api/update/status", base).toString();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4000);
    const [summaryRes, statusRes] = await Promise.all([
      fetch(summaryUrl, { cache: "no-store", signal: ac.signal }),
      fetch(statusUrl, { cache: "no-store", signal: ac.signal }).catch(() => null),
    ]).finally(() => clearTimeout(timer));
    if (!summaryRes.ok) return null;
    const summaryJson = (await summaryRes.json().catch(() => null)) as Record<string, unknown> | null;
    const statusJson = statusRes?.ok
      ? ((await statusRes.json().catch(() => null)) as Record<string, unknown> | null)
      : null;
    const summary = (summaryJson?.summary as Record<string, unknown> | undefined) ?? null;
    const periods = (summary?.periods as Record<string, unknown> | undefined) ?? null;
    const today = (periods?.today as Record<string, unknown> | undefined) ?? null;
    const yesterday = (periods?.yesterday as Record<string, unknown> | undefined) ?? null;
    const todayCritical = (today?.critical as unknown[] | undefined) ?? [];
    const todayTimeline = (today?.timeline as Array<Record<string, unknown>> | undefined) ?? [];
    const yesterdayCritical = (yesterday?.critical as unknown[] | undefined) ?? [];
    return {
      base,
      hasSnapshot: Boolean(summaryJson?.hasSnapshot),
      updateStatus: statusJson,
      today: {
        total: Number(today?.total ?? 0) || 0,
        withIssues: Boolean(today?.withIssues),
        criticalCount: Array.isArray(todayCritical) ? todayCritical.length : 0,
        timeline: Array.isArray(todayTimeline) ? todayTimeline.slice(0, 12) : [],
      },
      yesterday: {
        total: Number(yesterday?.total ?? 0) || 0,
        withIssues: Boolean(yesterday?.withIssues),
        criticalCount: Array.isArray(yesterdayCritical) ? yesterdayCritical.length : 0,
      },
    };
  } catch {
    return null;
  }
}

async function fetchBudgetPanel() {
  const now = new Date();
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const entries = await prisma.budgetEntry.findMany({
    where: { occurredOn: { gte: monthStart } },
    orderBy: { occurredOn: "desc" },
    take: 25,
  });
  const income = entries.filter((e) => e.amountCents > 0).reduce((a, e) => a + e.amountCents, 0);
  const expenses = entries.filter((e) => e.amountCents < 0).reduce((a, e) => a + e.amountCents, 0);
  return {
    monthStart: monthStart.toISOString(),
    incomeCents: income,
    expensesCents: expenses,
    netCents: income + expenses,
    recent: entries.slice(0, 8).map((e) => ({
      occurredOn: e.occurredOn.toISOString(),
      amountCents: e.amountCents,
      category: e.category,
      merchant: e.merchant,
      notes: e.notes,
    })),
  };
}

async function fetchTodoPanel() {
  const open = await prisma.todoItem.findMany({
    where: { status: "OPEN" },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: 12,
  });
  return open.map((t) => ({ title: t.title, notes: t.notes, pinned: t.pinned, updatedAt: t.updatedAt.toISOString() }));
}

export async function queueCodexTask(_prev: CodexQueueState, formData: FormData): Promise<CodexQueueState> {
  const text = String(formData.get("text") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();
  if (!text) return { ok: false, error: "Please type a request." };

  const active = await prisma.agentJob.findFirst({
    where: {
      kind: "codex",
      runner: "LOCAL",
      status: { in: ["QUEUED", "CLAIMED"] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (active) {
    return {
      ok: false,
      error: "Another Codex run is already in progress — please wait until it finishes.",
      activeJobId: active.id,
    };
  }

  const panelData: Record<string, unknown> = {
    goals: PERSONAL_GOALS,
    now: new Date().toISOString(),
    context: context || undefined,
  };
  if (context === "allsite") panelData.allsite = await fetchAllsitePanel();
  if (context === "budget") panelData.budget = await fetchBudgetPanel();
  if (context === "todo") panelData.todos = await fetchTodoPanel();
  if (context === "devotional") panelData.devotional = await getDevotionalToday(new Date());
  if (!context) {
    // General context for "morning plan" type asks.
    panelData.todos = await fetchTodoPanel();
    panelData.budget = await fetchBudgetPanel();
    panelData.allsite = await fetchAllsitePanel();
    panelData.devotional = await getDevotionalToday(new Date());
  }

  const panelDataJson = clampText(JSON.stringify(panelData));
  const agentType = isKnownAgentId(context) ? context : null;
  const memoryMarkdown = agentType ? await getAgentMemoryMarkdown(agentType) : "";

  const job = await prisma.agentJob.create({
    data: {
      kind: "codex",
      runner: "LOCAL",
      payloadJson: JSON.stringify({ text, context, agentType, panelDataJson, memoryMarkdown }),
      status: "QUEUED",
    },
  });

  if (agentType) {
    await prisma.agentRun.create({
      data: {
        agentType,
        status: "running",
        sourceJobId: job.id,
        inputJson: JSON.stringify({ text, context, panelData }),
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/codex");
  revalidatePath("/ai");

  return { ok: true, jobId: job.id };
}
