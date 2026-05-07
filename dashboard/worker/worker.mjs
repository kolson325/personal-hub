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

async function claimJob() {
  const job = await prisma.agentJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;
  return prisma.agentJob.update({
    where: { id: job.id },
    data: { status: "CLAIMED", claimedBy: WORKER_ID, claimedAt: new Date() },
  });
}

async function finishJob(id, status, resultText, errorText) {
  await prisma.agentJob.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      resultText: resultText ?? null,
      errorText: errorText ?? null,
    },
  });
}

async function handleJob(job) {
  const payload = JSON.parse(job.payloadJson ?? "{}");

  // Cloud worker intentionally does NOT execute arbitrary shell jobs.
  if (job.kind === "shell") {
    await finishJob(job.id, "FAILED", null, "Refusing to run arbitrary shell in cloud worker.");
    return;
  }

  if (job.kind === "redeploy") {
    const target = String(payload.target ?? "").trim();
    const composePath = process.env.DEPLOY_COMPOSE_PATH ?? "/infra";
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
    steps.push(`docker compose pull`);
    steps.push(`docker compose up -d --remove-orphans --build`);
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

while (true) {
  try {
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
