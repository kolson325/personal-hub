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
const AUTO_APPROVE_CODEX = String(process.env.AUTO_APPROVE_CODEX ?? "").trim() === "1";
const AUTO_APPROVE_AUTOMATIONS = String(process.env.AUTO_APPROVE_AUTOMATIONS ?? "").trim() === "1";

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

async function fetchAgentMemory(agentType) {
  const type = String(agentType ?? "").trim();
  if (!type) return "";
  const res = await fetch(`${DASHBOARD_URL}/api/agent/context?agentType=${encodeURIComponent(type)}`, {
    headers: { "x-agent-token": AGENT_TOKEN },
  }).catch(() => null);
  if (!res?.ok) return "";
  const data = await res.json().catch(() => null);
  return typeof data?.memoryMarkdown === "string" ? data.memoryMarkdown : "";
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

    async function runCodexForJob({ text, context, panelDataJson, memoryMarkdown, agentType, sandboxOverride }) {
      const requestText = String(text ?? "").trim();
      const ctx = String(context ?? "").trim();
      const panelJson = String(panelDataJson ?? "").trim();
      const memoryText = String(memoryMarkdown ?? "").trim() || (await fetchAgentMemory(agentType ?? ctx));
      if (!requestText) {
        await report(job.id, "FAILED", undefined, "Missing Codex request text.");
        return;
      }

      const ok = AUTO_APPROVE_CODEX || (await requireApproval(`Codex task requested${ctx ? ` (${ctx})` : ""}:\n${requestText}\nProceed?`));
      if (!ok) {
        await report(job.id, "FAILED", undefined, "User declined Codex task.");
        return;
      }

      const workdir =
        ctx === "combine" && COMBINE_REPO_PATH.trim()
          ? COMBINE_REPO_PATH
          : process.env.CODEX_CWD?.trim() || process.cwd();

      await report(job.id, "CLAIMED", `Starting Codex…\nworkdir: ${workdir}\ncontext: ${ctx || "—"}\n\n`, undefined);

      const preamble =
        `You are Kolson’s personal dashboard assistant.\n` +
        `Optimize for these goals: money, DevOps career growth, Allsite growth, health, relationship with God.\n` +
        `Act like a dedicated workplace assistant for this panel, not a generic chatbot.\n` +
        `Be decisive: give straight answers, a plan, and next actions. Compare against prior memory and avoid repeating stale advice.\n` +
        `If you need info, ask only the minimum.\n` +
        `Use PANEL_DATA_JSON when present; do not hallucinate missing numbers.\n\n`;

      const fullPrompt =
        preamble +
        (memoryText ? `AGENT_MEMORY:\n${memoryText}\n\n` : "") +
        (panelJson ? `PANEL_DATA_JSON:\n${panelJson}\n\n` : "") +
        `USER_REQUEST:\n${requestText}\n`;

      const codexArgs = [
        "exec",
        "--json",
        "--ephemeral",
        "--color",
        "never",
        "--skip-git-repo-check",
        "-s",
        sandboxOverride || process.env.CODEX_SANDBOX?.trim() || "workspace-write",
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
    }

    if (job.kind === "codex") {
      await runCodexForJob({
        text: payload.text,
        context: payload.context,
        panelDataJson: payload.panelDataJson,
        memoryMarkdown: payload.memoryMarkdown,
        agentType: payload.agentType,
        sandboxOverride: null,
      });
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
      const ok = AUTO_APPROVE_AUTOMATIONS || (await requireApproval(`Run automation on laptop?\n${key || "(missing key)"}\nProceed?`));
      if (!ok) {
        await report(job.id, "FAILED", undefined, "User declined automation.");
        return;
      }

      if (key === "bizdev_digest") {
        const notes = String(payload.configJson ?? "").trim();
        const text =
          `Generate my BizDev research report for today.\n` +
          `Focus: winning more snow removal + landscaping contracts for Allsite.\n` +
          `Use our proof points: KeyBank + GetGo satisfaction, certified woman-owned business.\n` +
          `Use live public web research when available. Start by running searches such as:\n` +
          `node scripts/research-web.mjs "multi-site retail property management snow removal landscaping Ohio Pennsylvania"\n` +
          `node scripts/research-web.mjs "facilities manager commercial property portfolio Pittsburgh Cincinnati Dayton Cleveland"\n` +
          `Output a crisp report with sections: Specific businesses to contact, website/source, why they fit, decision-maker role/contact path, outreach drafts (email + call), next 3 actions today.\n` +
          `Do not give generic target categories only. Name real businesses.\n` +
          (notes ? `\nSCHEDULE_CONFIG_JSON:\n${notes}\n` : "");
        await runCodexForJob({ text, context: "bizdev", panelDataJson: "", agentType: "bizdev", sandboxOverride: "read-only" });
        return;
      }

      if (key === "devops_radar") {
        const notes = String(payload.configJson ?? "").trim();
        const text =
          `Generate my DevOps research radar report for today.\n` +
          `Keep it decisive and practical for my stack: Octopus, Jenkins, Backstage, Atlassian, Teams, JBoss, Grafana, Kibana.\n` +
          `Use live public web research when available. Start by running searches such as:\n` +
          `node scripts/research-web.mjs "latest Octopus Deploy release Jenkins Backstage Grafana Kibana DevOps platform engineering"\n` +
          `node scripts/research-web.mjs "new platform engineering tools 2026 CI CD observability internal developer portal"\n` +
          `Output sections: what is new, source links, why it matters, how it improves our current stack, how to implement, 30-minute starter task.\n` +
          `Do not give generic advice. Tie each recommendation to current tools we use.\n` +
          (notes ? `\nSCHEDULE_CONFIG_JSON:\n${notes}\n` : "");
        await runCodexForJob({ text, context: "devops", panelDataJson: "", agentType: "devops", sandboxOverride: "read-only" });
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
