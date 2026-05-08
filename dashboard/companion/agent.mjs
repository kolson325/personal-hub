import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { createInterface } from "node:readline";

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

loadEnvLocal();

const DASHBOARD_URL = (process.env.DASHBOARD_URL ?? "http://localhost:3000").replace(/\/$/, "");
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? "";
const AGENT_ID = process.env.AGENT_ID ?? "unknown-agent";
const COMBINE_REPO_PATH = process.env.COMBINE_REPO_PATH ?? "";

if (!AGENT_TOKEN.trim()) {
  console.error("Missing AGENT_TOKEN. Set it in .env.local.");
  process.exit(2);
}

async function pollOnce() {
  const res = await fetch(
    `${DASHBOARD_URL}/api/agent/poll?agent_id=${encodeURIComponent(AGENT_ID)}&runner=LOCAL`,
    {
    headers: { "x-agent-token": AGENT_TOKEN },
    }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(`Poll failed: ${res.status} ${JSON.stringify(data)}`);
  return data.job;
}

async function heartbeat() {
  const res = await fetch(`${DASHBOARD_URL}/api/agent/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ agentId: AGENT_ID, runner: "LOCAL" }),
  }).catch(() => null);
  if (!res?.ok) return;
  await res.json().catch(() => null);
}

async function report(id, status, resultText, errorText, append) {
  const res = await fetch(`${DASHBOARD_URL}/api/agent/report`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-agent-token": AGENT_TOKEN },
    body: JSON.stringify({ id, status, resultText, errorText, append }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(`Report failed: ${res.status} ${JSON.stringify(data)}`);
}

async function progress(id, line) {
  await report(id, "CLAIMED", line, undefined, true);
}

function runShell(command) {
  const out = spawnSync(command, { shell: true, encoding: "utf8" });
  return { code: out.status ?? 1, stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
}

async function requireApproval(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = await rl.question(`${prompt} (y/N): `);
    return ans.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

async function handleJob(job) {
  const payload = JSON.parse(job.payloadJson ?? "{}");
  try {
    if (job.kind === "note") {
      await report(job.id, "SUCCEEDED", `Noted:\n${payload.text ?? ""}`, undefined);
      return;
    }

    if (job.kind === "codex") {
      const text = String(payload.text ?? "").trim();
      const context = String(payload.context ?? "").trim();
      const panelDataJson = String(payload.panelDataJson ?? "").trim();
      const ok = await requireApproval(`Codex task requested${context ? ` (${context})` : ""}:\n${text}\nProceed?`);
      if (!ok) {
        await report(job.id, "FAILED", undefined, "User declined Codex task.");
        return;
      }

      const workdir =
        context === "combine" && COMBINE_REPO_PATH.trim()
          ? COMBINE_REPO_PATH
          : process.env.CODEX_CWD?.trim() || process.cwd();

      await report(job.id, "CLAIMED", `Starting Codex…\nworkdir: ${workdir}\ncontext: ${context || "—"}\n\n`, undefined);

      const preamble =
        `You are Kolson’s personal dashboard assistant.\n` +
        `Optimize for these goals: money, DevOps career growth, Allsite growth, health, relationship with God.\n` +
        `Be decisive: give straight answers, a plan, and next actions (not long research). If you need info, ask only the minimum.\n` +
        `Use PANEL_DATA_JSON when present; do not hallucinate missing numbers.\n\n`;

      const fullPrompt =
        preamble +
        (panelDataJson ? `PANEL_DATA_JSON:\n${panelDataJson}\n\n` : "") +
        `USER_REQUEST:\n${text}\n`;

      const codexArgs = [
        "exec",
        "--json",
        "--ephemeral",
        "--color",
        "never",
        "--skip-git-repo-check",
        "-s",
        process.env.CODEX_SANDBOX?.trim() || "workspace-write",
        "-C",
        workdir,
        fullPrompt,
      ];

      const child = spawn("codex", codexArgs, { stdio: ["ignore", "pipe", "pipe"] });

      let agentText = "";
      let sawJson = false;
      let lastProgressAt = Date.now();

      const stdout = createInterface({ input: child.stdout });
      const stderr = createInterface({ input: child.stderr });

      stdout.on("line", (line) => {
        const trimmed = String(line ?? "").trim();
        if (!trimmed) return;
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          sawJson = true;
          try {
            const evt = JSON.parse(trimmed);
            if (evt?.method === "item/agentMessage/delta" && typeof evt?.params?.delta === "string") {
              agentText += evt.params.delta;
              void progress(job.id, evt.params.delta);
              lastProgressAt = Date.now();
              return;
            }
            if (evt?.type === "item.completed" && evt?.item?.type === "agent_message" && typeof evt.item.text === "string") {
              agentText += (agentText ? "\n" : "") + evt.item.text;
              void progress(job.id, evt.item.text);
              lastProgressAt = Date.now();
              return;
            }
            if (evt?.type === "turn.started") {
              void progress(job.id, "Thinking…");
              lastProgressAt = Date.now();
              return;
            }
          } catch {
            // fall through to raw logging
          }
        }

        // Non-JSON noise: keep it minimal so the UI stays readable.
        if (!sawJson && /WARN|ERROR|Reading additional input from stdin/i.test(trimmed)) return;
        void progress(job.id, trimmed);
        lastProgressAt = Date.now();
      });

      stderr.on("line", (line) => {
        const trimmed = String(line ?? "").trim();
        if (!trimmed) return;
        if (/WARN|ERROR/i.test(trimmed)) {
          void progress(job.id, trimmed);
          lastProgressAt = Date.now();
        }
      });

      const heartbeat = setInterval(() => {
        if (Date.now() - lastProgressAt > 10_000) {
          void progress(job.id, "…still working…");
          lastProgressAt = Date.now();
        }
      }, 5000);

      const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code ?? 1));
        child.on("error", () => resolve(1));
      });

      clearInterval(heartbeat);
      stdout.close();
      stderr.close();

      if (exitCode === 0) {
        await report(job.id, "SUCCEEDED", agentText.trim() || "Done.", undefined);
      } else {
        await report(job.id, "FAILED", agentText.trim() || undefined, `Codex exited with code ${exitCode}`);
      }
      return;
    }

    if (job.kind === "shell") {
      const command = String(payload.text ?? "").trim();
      if (!command) {
        await report(job.id, "FAILED", undefined, "Missing shell command text.");
        return;
      }
      const ok = await requireApproval(`Run shell command?\n${command}`);
      if (!ok) {
        await report(job.id, "FAILED", undefined, "User declined execution.");
        return;
      }
      const { code, stdout, stderr } = runShell(command);
      const result = `exit=${code}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`;
      await report(job.id, code === 0 ? "SUCCEEDED" : "FAILED", result, code === 0 ? undefined : "Command failed");
      return;
    }

    if (job.kind === "combine_scan") {
      if (!COMBINE_REPO_PATH.trim()) {
        await report(job.id, "FAILED", undefined, "Missing COMBINE_REPO_PATH in .env.local.");
        return;
      }
      const ok = await requireApproval(`Scan THE-COMBINE repo at:\n${COMBINE_REPO_PATH}\nProceed?`);
      if (!ok) {
        await report(job.id, "FAILED", undefined, "User declined scan.");
        return;
      }
      const log = runShell(`git -C ${JSON.stringify(COMBINE_REPO_PATH)} log -n 15 --pretty=format:%h\\ %ad\\ %s --date=short`);
      const status = runShell(`git -C ${JSON.stringify(COMBINE_REPO_PATH)} status --porcelain=v1`);
      const result =
        `THE-COMBINE scan\n\nRecent commits:\n${log.stdout || "(none)"}\n\nWorking tree:\n${status.stdout || "(clean)"}\n\n(stderr)\n${log.stderr}${status.stderr}`;
      await report(job.id, "SUCCEEDED", result, undefined);
      return;
    }

    if (job.kind === "redeploy") {
      const ok = await requireApproval(`Redeploy requested:\n${job.payloadJson}\nProceed?`);
      if (!ok) {
        await report(job.id, "FAILED", undefined, "User declined redeploy.");
        return;
      }
      // Placeholder: for VPS we’ll run docker compose or CI deploy here.
      await report(job.id, "SUCCEEDED", `Queued redeploy acknowledged by companion.\n${job.payloadJson}`, undefined);
      return;
    }

    if (job.kind === "automation") {
      const key = String(payload.key ?? "").trim();
      const ok = await requireApproval(`Run automation on laptop?\n${key || "(missing key)"}\nProceed?`);
      if (!ok) {
        await report(job.id, "FAILED", undefined, "User declined automation.");
        return;
      }

      if (key === "gmail_triage") {
        await report(
          job.id,
          "SUCCEEDED",
          "Gmail triage placeholder: open Codex and ask it to triage your inbox, then paste results here later.\n\nNext step: wire this companion to Gmail (OAuth) or have Codex write results back automatically.",
          undefined
        );
        return;
      }

      await report(job.id, "FAILED", undefined, `Unknown automation key for LOCAL runner: ${key}`);
      return;
    }

    await report(job.id, "FAILED", undefined, `Unknown job kind: ${job.kind}`);
  } catch (e) {
    await report(job.id, "FAILED", undefined, String(e));
  }
}

console.log(`Companion running as ${AGENT_ID}`);
console.log(`Server: ${DASHBOARD_URL}`);

// Poll loop
while (true) {
  try {
    await heartbeat();
    const job = await pollOnce();
    if (job) {
      console.log(`Claimed job ${job.id} (${job.kind})`);
      await handleJob(job);
    } else {
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (e) {
    console.error(String(e));
    await new Promise((r) => setTimeout(r, 5000));
  }
}
