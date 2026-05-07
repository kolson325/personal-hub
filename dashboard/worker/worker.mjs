import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

function loadEnvLocal() {
  const root = resolve(new URL("..", import.meta.url).pathname);
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

// For local dev runs only.
loadEnvLocal();

const WORKER_ID = process.env.WORKER_ID ?? "cloud-worker";
const prisma = new PrismaClient();

function run(cmd, cwd) {
  const out = spawnSync(cmd, { shell: true, cwd, encoding: "utf8" });
  return { code: out.status ?? 1, stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
}

function parseTimeOfDay(raw) {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function computeNextRunAt(schedule, from = new Date()) {
  const now = new Date(from);
  const scheduleType = schedule.scheduleType ?? "INTERVAL";

  if (scheduleType === "INTERVAL") {
    const mins = Math.max(1, Math.floor(Number(schedule.intervalMinutes ?? 60) || 60));
    return new Date(now.getTime() + mins * 60 * 1000);
  }

  const parsed = parseTimeOfDay(schedule.timeOfDay ?? "09:00");
  const hh = parsed?.hh ?? 9;
  const mm = parsed?.mm ?? 0;

  if (scheduleType === "DAILY") {
    const next = new Date(now);
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
    for (const d of [1, 2, 3, 4, 5]) allowed.add(d);
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const cand = new Date(now);
    cand.setDate(cand.getDate() + offset);
    cand.setHours(hh, mm, 0, 0);
    if (!allowed.has(cand.getDay())) continue;
    if (cand.getTime() <= now.getTime()) continue;
    return cand;
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(hh, mm, 0, 0);
  return fallback;
}

async function claimJob() {
  const job = await prisma.agentJob.findFirst({
    where: { status: "QUEUED", runner: "VPS" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;
  return prisma.agentJob.update({
    where: { id: job.id },
    data: { status: "CLAIMED", claimedBy: WORKER_ID, claimedAt: new Date() },
  });
}

async function finishJob(id, status, resultText, errorText) {
  const updated = await prisma.agentJob.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      resultText: resultText ?? null,
      errorText: errorText ?? null,
    },
  });

  if (updated.scheduleId) {
    await prisma.automationSchedule
      .update({
        where: { id: updated.scheduleId },
        data: { lastRunAt: updated.finishedAt ?? new Date() },
      })
      .catch(() => {});
  }
}

async function tickSchedules() {
  const now = new Date();
  const due = await prisma.automationSchedule.findMany({
    where: {
      enabled: true,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
    },
    orderBy: [{ nextRunAt: "asc" }],
    take: 20,
  });
  if (due.length === 0) return;

  for (const s of due) {
    const existing = await prisma.agentJob.findFirst({
      where: { kind: "automation", scheduleId: s.id, status: { in: ["QUEUED", "CLAIMED"] } },
    });
    if (existing) continue;

    const nextRunAt = computeNextRunAt(s, now);
    let runner = "VPS";
    try {
      const cfg = s.configJson ? JSON.parse(s.configJson) : null;
      if (cfg?.requiresLocalCompanion) runner = "LOCAL";
    } catch {}
    await prisma.$transaction([
      prisma.agentJob.create({
        data: {
          kind: "automation",
          scheduleId: s.id,
          payloadJson: JSON.stringify({ key: s.key, configJson: s.configJson }),
          status: "QUEUED",
          runner,
        },
      }),
      prisma.automationSchedule.update({ where: { id: s.id }, data: { nextRunAt } }),
    ]);
  }
}

async function runAgentRun(agentType, input, outputMarkdown) {
  const run = await prisma.agentRun.create({
    data: {
      agentType,
      status: "running",
      inputJson: input ? JSON.stringify(input) : null,
    },
  });

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "succeeded", finishedAt: new Date(), outputMarkdown },
  });
  return run.id;
}

async function handleJob(job) {
  const payload = JSON.parse(job.payloadJson ?? "{}");

  // Cloud worker intentionally does NOT execute arbitrary shell jobs.
  if (job.kind === "shell") {
    await finishJob(job.id, "FAILED", null, "Refusing to run arbitrary shell in cloud worker.");
    return;
  }

  if (job.kind === "note") {
    const text = String(payload.text ?? "").trim();
    await finishJob(job.id, "SUCCEEDED", text ? `Saved note:\n\n${text}` : "Saved note.", null);
    return;
  }

  if (job.kind === "combine_scan") {
    await finishJob(
      job.id,
      "FAILED",
      null,
      "THE-COMBINE scan requires a local companion on your laptop (not yet implemented on this VPS)."
    );
    return;
  }

  if (job.kind === "automation") {
    const key = String(payload.key ?? "").trim();
    if (!key) {
      await finishJob(job.id, "FAILED", null, "Missing automation key.");
      return;
    }

    if (key === "allsite_update") {
      const base = process.env.ALLSITE_CENTRAL_HUB_URL ?? "";
      if (!base) {
        await finishJob(job.id, "FAILED", null, "Missing ALLSITE_CENTRAL_HUB_URL in worker env.");
        return;
      }
      const url = new URL("/api/update", base).toString();
      try {
        const res = await fetch(url, { method: "POST" });
        const text = await res.text();
        if (!res.ok) {
          await finishJob(job.id, "FAILED", null, `Allsite update failed: HTTP ${res.status}\n\n${text.slice(0, 2000)}`);
          return;
        }
        await finishJob(job.id, "SUCCEEDED", `Allsite update queued.\n\n${text.slice(0, 2000)}`, null);
        return;
      } catch (e) {
        await finishJob(job.id, "FAILED", null, `Allsite update error: ${String(e?.message ?? e)}`);
        return;
      }
    }

    if (key === "bizdev_digest") {
      const notes = "Daily scheduled run";
      const md =
        `## BizDev Agent (scheduled placeholder)\n\n` +
        `Today’s focus:\n` +
        `- Build a target list of large multi-site companies in Western PA/OH.\n` +
        `- Capture facilities/ops decision makers + outreach drafts.\n\n` +
        `Proof points to use:\n` +
        `- History of satisfaction with GetGo + KeyBank.\n` +
        `- Certified woman-owned business.\n\n` +
        `Next step to make this “real”:\n` +
        `- Add web research sources + an LLM summarizer and store contacts.\n`;
      await runAgentRun("bizdev", { notes }, md);
      await finishJob(job.id, "SUCCEEDED", "BizDev digest saved to Agent Runs.", null);
      return;
    }

    if (key === "devops_radar") {
      const focus = "Daily scheduled run";
      const md =
        `## DevOps Tech Radar (scheduled placeholder)\n\n` +
        `Today’s topics to track:\n` +
        `- Platform engineering: Backstage scorecards + golden paths.\n` +
        `- CI/CD: progressive delivery, ephemeral envs, policy-as-code.\n` +
        `- Observability: OpenTelemetry rollout patterns + cost control.\n` +
        `- Supply chain: SBOMs, provenance signing, secret scanning.\n\n` +
        `Next step to make this “real”:\n` +
        `- Add RSS/source list + weekly digest + “what changed” diffs.\n`;
      await runAgentRun("devops", { focus }, md);
      await finishJob(job.id, "SUCCEEDED", "DevOps digest saved to Agent Runs.", null);
      return;
    }

    if (key === "todo_triage") {
      const md =
        `## Inbox / Tasks Triage (placeholder)\n\n` +
        `Not connected to email yet.\n\n` +
        `Next step:\n` +
        `- Connect Gmail and summarize important threads into Tasks.\n`;
      await runAgentRun("todo", {}, md);
      await finishJob(job.id, "SUCCEEDED", "Triage placeholder saved to Agent Runs.", null);
      return;
    }

    if (key === "services_ping") {
      const services = await prisma.service.findMany({ orderBy: { createdAt: "asc" } });
      const results = [];
      for (const s of services) {
        if (!s.url) continue;
        try {
          const res = await fetch(s.url, { method: "GET" });
          results.push({ name: s.name, url: s.url, status: res.status });
        } catch (e) {
          results.push({ name: s.name, url: s.url, status: 0, error: String(e?.message ?? e) });
        }
      }
      const md =
        `## Service Ping (placeholder)\n\n` +
        (results.length === 0
          ? `No service URLs configured.\n`
          : results.map((r) => `- ${r.name}: ${r.url} → ${r.status}${r.error ? ` (${r.error})` : ""}`).join("\n"));
      await runAgentRun("services", {}, md);
      await finishJob(job.id, "SUCCEEDED", "Service ping saved to Agent Runs.", null);
      return;
    }

    if (key === "budget_digest") {
      const since = new Date(Date.now() - 30 * 86400 * 1000);
      const entries = await prisma.budgetEntry.findMany({ where: { occurredOn: { gte: since } } });
      const income = entries.filter((e) => e.amountCents > 0).reduce((a, e) => a + e.amountCents, 0);
      const expenses = entries.filter((e) => e.amountCents < 0).reduce((a, e) => a + e.amountCents, 0);
      const net = income + expenses;

      const byCat = new Map();
      for (const e of entries) {
        if (e.amountCents >= 0) continue;
        const cat = String(e.category ?? "Uncategorized").trim() || "Uncategorized";
        byCat.set(cat, (byCat.get(cat) ?? 0) + e.amountCents);
      }
      const topCats = Array.from(byCat.entries())
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 10);

      const fmt = (cents) => {
        const sign = cents < 0 ? "-" : "";
        const abs = Math.abs(cents);
        return `${sign}$${(abs / 100).toFixed(2)}`;
      };

      const md =
        `## Budget Digest (last 30 days)\n\n` +
        `- Income: ${fmt(income)}\n` +
        `- Expenses: ${fmt(expenses)}\n` +
        `- Net: ${fmt(net)}\n\n` +
        `### Top categories (expenses)\n` +
        (topCats.length === 0 ? `- (no expenses)\n` : topCats.map(([k, v]) => `- ${k}: ${fmt(v)}`).join("\n")) +
        `\n\nNext step (optional): tag entries consistently (Gas/Food/Bills/etc.) for clearer insights.\n`;

      await runAgentRun("budget", {}, md);
      await finishJob(job.id, "SUCCEEDED", "Budget digest saved to Agent Runs.", null);
      return;
    }

    await finishJob(job.id, "FAILED", null, `Unknown automation key: ${key}`);
    return;
  }

  if (job.kind === "redeploy") {
    const target = String(payload.target ?? "").trim();
    const composePath = process.env.DEPLOY_COMPOSE_PATH ?? "/repo/infra";
    const repoDir = process.env.REPO_DIR ?? "/repo";
    const doGitPull = (process.env.GIT_PULL ?? "").trim() === "1";

    const allowedTargets = new Set(["dashboard", "centralhub", "bizdev-agent", "devops-agent", "combine-monitor"]);
    if (!allowedTargets.has(target)) {
      await finishJob(job.id, "FAILED", null, `Unknown redeploy target: ${target}`);
      return;
    }

    // Assumes docker compose is available on the host and /var/run/docker.sock is mounted.
    const steps = [];
    if (doGitPull) {
      steps.push(`git -C ${JSON.stringify(repoDir)} rev-parse --short HEAD || true`);
      steps.push(`git -C ${JSON.stringify(repoDir)} pull --ff-only`);
      steps.push(`git -C ${JSON.stringify(repoDir)} rev-parse --short HEAD || true`);
    }
    // Ensure the worker doesn't require buildx/Bake support inside its image.
    steps.push(`COMPOSE_BAKE=0 docker compose pull`);
    steps.push(`COMPOSE_BAKE=0 docker compose up -d --remove-orphans --build`);
    const logs = [];
    let ok = true;
    for (const step of steps) {
      const r = run(step, composePath);
      logs.push(`$ ${step}\nexit=${r.code}\n${r.stdout}\n${r.stderr}`);
      if (r.code !== 0) ok = false;
    }

    await finishJob(job.id, ok ? "SUCCEEDED" : "FAILED", logs.join("\n\n"), ok ? null : "Redeploy failed");
    return;
  }

  await finishJob(job.id, "FAILED", null, `Unhandled job kind: ${job.kind}`);
}

console.log(`Worker started: ${WORKER_ID}`);

let lastScheduleTickAt = 0;

while (true) {
  try {
    const nowMs = Date.now();
    if (nowMs - lastScheduleTickAt > 5000) {
      lastScheduleTickAt = nowMs;
      await tickSchedules();
    }

    const job = await claimJob();
    if (job) {
      console.log(`Claimed job ${job.id} (${job.kind})`);
      await handleJob(job);
    } else {
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (e) {
    console.error(String(e));
    await new Promise((r) => setTimeout(r, 5000));
  }
}
