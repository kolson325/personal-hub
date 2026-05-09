"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getAgentMemoryMarkdown } from "@/lib/agent-memory";

function parseTimeOfDay(raw: string) {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return { hh, mm, norm: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
}

function computeNextRunAt(schedule: {
  scheduleType: "INTERVAL" | "DAILY" | "WEEKLY";
  intervalMinutes?: number | null;
  timeOfDay?: string | null;
  daysOfWeek?: string | null;
}, from = new Date()) {
  const now = new Date(from);
  if (schedule.scheduleType === "INTERVAL") {
    const mins = Math.max(1, Math.floor(Number(schedule.intervalMinutes ?? 60) || 60));
    return new Date(now.getTime() + mins * 60 * 1000);
  }

  const parsed = parseTimeOfDay(String(schedule.timeOfDay ?? "09:00"));
  const hh = parsed?.hh ?? 9;
  const mm = parsed?.mm ?? 0;

  if (schedule.scheduleType === "DAILY") {
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(hh, mm, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  const allowed = new Set(
    String(schedule.daysOfWeek ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
  );
  if (allowed.size === 0) {
    // Default: weekdays.
    for (const d of [1, 2, 3, 4, 5]) allowed.add(d);
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const cand = new Date(now);
    cand.setDate(cand.getDate() + offset);
    cand.setHours(hh, mm, 0, 0);
    cand.setSeconds(0, 0);
    if (!allowed.has(cand.getDay())) continue;
    if (cand.getTime() <= now.getTime()) continue;
    return cand;
  }

  // Fallback: one week from now.
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(hh, mm, 0, 0);
  return fallback;
}

const TEMPLATE_DEFS: Record<
  string,
  {
    key: string;
    name: string;
    scheduleType: "INTERVAL" | "DAILY" | "WEEKLY";
    intervalMinutes?: number;
    timeOfDay?: string;
    daysOfWeek?: string;
    config?: Record<string, unknown>;
  }
> = {
  allsite_update: {
    key: "allsite_update",
    name: "Allsite hub snapshot update",
    scheduleType: "INTERVAL",
    intervalMinutes: 180,
  },
  bizdev_digest: {
    key: "bizdev_digest",
    name: "BizDev lead research digest",
    scheduleType: "DAILY",
    timeOfDay: "07:30",
    config: { requiresLocalCompanion: true, agentType: "bizdev" },
  },
  devops_radar: {
    key: "devops_radar",
    name: "DevOps tech radar digest",
    scheduleType: "DAILY",
    timeOfDay: "07:45",
    config: { requiresLocalCompanion: true, agentType: "devops" },
  },
  todo_triage: {
    key: "todo_triage",
    name: "Inbox/tasks triage (placeholder)",
    scheduleType: "DAILY",
    timeOfDay: "08:00",
  },
  services_ping: {
    key: "services_ping",
    name: "Service health ping (placeholder)",
    scheduleType: "INTERVAL",
    intervalMinutes: 60,
  },
  budget_digest: {
    key: "budget_digest",
    name: "Budget daily digest",
    scheduleType: "DAILY",
    timeOfDay: "07:10",
  },
  gmail_triage: {
    key: "gmail_triage",
    name: "Gmail inbox triage (runs on laptop companion)",
    scheduleType: "DAILY",
    timeOfDay: "07:20",
    config: { requiresLocalCompanion: true },
  },
  combine_scan: {
    key: "combine_scan",
    name: "THE-COMBINE scan (requires laptop companion)",
    scheduleType: "INTERVAL",
    intervalMinutes: 240,
    config: { requiresLocalCompanion: true },
  },
};

export async function createScheduleFromTemplate(formData: FormData) {
  const templateId = String(formData.get("template") ?? "").trim();
  const def = TEMPLATE_DEFS[templateId];
  if (!def) return;

  const existing = await prisma.automationSchedule.findFirst({ where: { key: def.key } });
  if (existing) return;

  const nextRunAt = computeNextRunAt(
    {
      scheduleType: def.scheduleType,
      intervalMinutes: def.intervalMinutes ?? null,
      timeOfDay: def.timeOfDay ?? null,
      daysOfWeek: def.daysOfWeek ?? null,
    },
    new Date()
  );

  await prisma.automationSchedule.create({
    data: {
      key: def.key,
      name: def.name,
      enabled: true,
      scheduleType: def.scheduleType,
      intervalMinutes: def.intervalMinutes ?? null,
      timeOfDay: def.timeOfDay ?? null,
      daysOfWeek: def.daysOfWeek ?? null,
      configJson: def.config ? JSON.stringify(def.config) : null,
      nextRunAt,
    },
  });

  revalidatePath("/automations");
  revalidatePath("/");
}

export async function toggleScheduleEnabled(id: string) {
  const s = await prisma.automationSchedule.findUnique({ where: { id } });
  if (!s) return;
  const enabled = !s.enabled;
  await prisma.automationSchedule.update({
    where: { id },
    data: {
      enabled,
      nextRunAt: enabled
        ? s.nextRunAt ??
          computeNextRunAt({
            scheduleType: s.scheduleType,
            intervalMinutes: s.intervalMinutes,
            timeOfDay: s.timeOfDay,
            daysOfWeek: s.daysOfWeek,
          })
        : null,
    },
  });
  revalidatePath("/automations");
  revalidatePath("/");
}

export async function updateSchedule(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const name = String(formData.get("name") ?? "").trim() || "Automation";
  const scheduleTypeRaw = String(formData.get("scheduleType") ?? "INTERVAL").trim();
  const scheduleType: "INTERVAL" | "DAILY" | "WEEKLY" =
    scheduleTypeRaw === "DAILY" || scheduleTypeRaw === "WEEKLY" ? scheduleTypeRaw : "INTERVAL";
  const intervalMinutesRaw = String(formData.get("intervalMinutes") ?? "").trim();
  const intervalMinutes = intervalMinutesRaw ? Math.max(1, Math.floor(Number(intervalMinutesRaw) || 0)) : null;

  const timeParsed = parseTimeOfDay(String(formData.get("timeOfDay") ?? "").trim() || "09:00");
  const timeOfDay = timeParsed?.norm ?? null;

  const daysOfWeek = String(formData.get("daysOfWeek") ?? "").trim() || null;

  const cur = await prisma.automationSchedule.findUnique({ where: { id } });
  if (!cur) return;

  const nextRunAt = cur.enabled
    ? computeNextRunAt(
        {
          scheduleType,
          intervalMinutes,
          timeOfDay,
          daysOfWeek,
        },
        new Date()
      )
    : null;

  await prisma.automationSchedule.update({
    where: { id },
    data: {
      name,
      scheduleType,
      intervalMinutes,
      timeOfDay,
      daysOfWeek,
      nextRunAt,
    },
  });

  revalidatePath("/automations");
  revalidatePath("/");
}

export async function deleteSchedule(id: string) {
  await prisma.automationSchedule.delete({ where: { id } }).catch(() => {});
  revalidatePath("/automations");
  revalidatePath("/");
}

export async function runScheduleNow(id: string) {
  const s = await prisma.automationSchedule.findUnique({ where: { id } });
  if (!s) return;
  let requiresLocal = false;
  let agentType: string | null = null;
  try {
    const cfg = s.configJson ? JSON.parse(s.configJson) : null;
    requiresLocal = Boolean(cfg?.requiresLocalCompanion);
    agentType = typeof cfg?.agentType === "string" ? cfg.agentType : null;
  } catch {}
  if (s.key === "bizdev_digest") {
    requiresLocal = true;
    agentType = "bizdev";
  }
  if (s.key === "devops_radar") {
    requiresLocal = true;
    agentType = "devops";
  }
  const memoryMarkdown = agentType ? await getAgentMemoryMarkdown(agentType) : "";
  await prisma.agentJob.create({
    data: {
      kind: "automation",
      scheduleId: s.id,
      payloadJson: JSON.stringify({ key: s.key, configJson: s.configJson, agentType, memoryMarkdown }),
      status: "QUEUED",
      runner: requiresLocal ? "LOCAL" : "VPS",
    },
  });
  revalidatePath("/automations");
  revalidatePath("/");
}
