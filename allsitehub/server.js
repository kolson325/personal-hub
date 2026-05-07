import express from "express";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { buildSummary, buildSiteDetails } from "./lib/summary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4545;
const HOST = process.env.HOST ?? "0.0.0.0";

const dataDir = path.join(__dirname, "data");
const snapshotPath = path.join(dataDir, "snapshot.json");
const dashboardConfigPath = path.join(__dirname, "config", "dashboard.json");
const deployLogPath = path.join(dataDir, "deploy.log");
const deployStatusPath = path.join(dataDir, "deploy-status.json");
const publicUrlPath = path.join(dataDir, "public-url.txt");
const deployScriptPath = path.join(__dirname, "scripts", "deploy-dashboard.sh");
const updateLogPath = path.join(dataDir, "update.log");
const updateStatusPath = path.join(dataDir, "update-status.json");

let deployProcess = null;
let updateProcess = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function requireLocalRequest(req, res, next) {
  const host = String(req.get("host") ?? "").split(":")[0].toLowerCase();
  const isForwarded = Boolean(req.get("x-forwarded-for") || req.get("x-forwarded-host") || req.get("x-forwarded-proto"));
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (localHosts.has(host) && !isForwarded) return next();
  return res.status(403).json({ error: "Deploy is only available from this laptop at http://localhost:4545/deploy.html." });
}

async function readDeployStatus() {
  const rawStatus = await readTextIfExists(deployStatusPath);
  let status = { state: "idle", message: "Ready to deploy", updatedAt: null };
  if (rawStatus) {
    try {
      status = JSON.parse(rawStatus);
    } catch {
      status = { state: "unknown", message: "Status file could not be parsed", updatedAt: null };
    }
  }

  const log = await readTextIfExists(deployLogPath);
  const publicUrl = (await readTextIfExists(publicUrlPath)).trim() || "https://allsitefacilities-centralhub.loca.lt";
  return { ...status, running: Boolean(deployProcess), publicUrl, log: log.slice(-20000) };
}

async function readUpdateStatus() {
  const rawStatus = await readTextIfExists(updateStatusPath);
  let status = { state: "idle", message: "Ready to update", updatedAt: null, startedAt: null, finishedAt: null };
  if (rawStatus) {
    try {
      status = JSON.parse(rawStatus);
    } catch {
      status = { state: "unknown", message: "Status file could not be parsed", updatedAt: null, startedAt: null, finishedAt: null };
    }
  }
  const log = await readTextIfExists(updateLogPath);
  return { ...status, running: Boolean(updateProcess), log: log.slice(-20000) };
}

app.get("/api/snapshot", async (_req, res) => {
  try {
    const raw = await fs.readFile(snapshotPath, "utf8");
    res.type("json").send(raw);
  } catch {
    res.status(404).json({
      error: "No snapshot yet. Run `npm run update` after configuring credentials/endpoints."
    });
  }
});

app.get("/api/update/status", async (_req, res) => {
  res.json(await readUpdateStatus());
});

app.get("/api/summary", async (_req, res) => {
  try {
    let snapshot = null;
    try {
      const raw = await fs.readFile(snapshotPath, "utf8");
      snapshot = JSON.parse(raw);
    } catch {
      snapshot = null;
    }
    const summary = snapshot ? buildSummary(snapshot) : [];
    let dashboardConfig = {};
    try {
      dashboardConfig = JSON.parse(await fs.readFile(dashboardConfigPath, "utf8"));
    } catch {
      dashboardConfig = {};
    }
    res.json({ summary, dashboardConfig, hasSnapshot: Boolean(snapshot) });
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Site drill-in (detail drawer). If `?site=` is omitted, return an empty payload
// instead of 404/400 so the UI can fail gracefully.
app.get("/api/site-details", async (req, res) => {
  try {
    const site = String(req.query.site ?? "").trim();
    if (!site) return res.json({ site: null, latest: null, photos: [], submissions: [] });

    let snapshot = null;
    try {
      const raw = await fs.readFile(snapshotPath, "utf8");
      snapshot = JSON.parse(raw);
    } catch {
      snapshot = null;
    }
    if (!snapshot) {
      return res.status(404).json({ error: "No snapshot yet. Run update first.", site });
    }
    const details = buildSiteDetails(snapshot, site);
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/api/deploy/status", requireLocalRequest, async (_req, res) => {
  res.json(await readDeployStatus());
});

app.post("/api/deploy", requireLocalRequest, async (_req, res) => {
  if (deployProcess) {
    return res.status(409).json({ error: "Deploy already running.", status: await readDeployStatus() });
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    deployStatusPath,
    JSON.stringify({ state: "queued", message: "Deploy queued", updatedAt: new Date().toISOString() }, null, 2)
  );

  deployProcess = spawn("/bin/bash", [deployScriptPath], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      SOURCE_DIR:
        process.env.SOURCE_DIR ??
        "/Users/kolsondesocio/Desktop/ALLSITE/THE-COMBINE/SITE-FOTOS-DASHBOARD/sitefotos-dashboard",
      DEST_DIR: process.env.DEST_DIR ?? "/Users/kolsondesocio/SiteFotos/sitefotos-dashboard"
    }
  });
  deployProcess.once("exit", () => {
    deployProcess = null;
  });
  deployProcess.unref();

  res.status(202).json({ ok: true, status: await readDeployStatus() });
});

let lastUpdateStartedAt = null;

function getUpdateMinIntervalSeconds() {
  const raw = Number(process.env.UPDATE_MIN_INTERVAL_SECONDS ?? 60);
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 60;
}

function getUpdateMaxSeconds() {
  const raw = Number(process.env.UPDATE_MAX_SECONDS ?? 180);
  return Number.isFinite(raw) ? Math.max(10, Math.floor(raw)) : 180;
}

// Browser-friendly: visiting `/api/update` in a browser will show a page with a POST button.
// Actual updates run via POST so random link previews/crawlers don't trigger work.
app.get("/api/update", async (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Allsite Hub Update</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; padding: 24px; background: #0b0f17; color: #e7eaf0; }
      .card { max-width: 720px; margin: 0 auto; background: #111827; border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 20px; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { margin: 0 0 14px; color: rgba(231,234,240,.82); line-height: 1.4; }
      .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
      button, a { display: inline-flex; align-items: center; justify-content: center; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: #2563eb; color: #fff; text-decoration: none; font-weight: 600; }
      a { background: transparent; }
      code { background: rgba(255,255,255,.06); padding: 2px 6px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Run update</h1>
      <p>This triggers the snapshot refresh (same as <code>POST /api/update</code>).</p>
      <div class="row">
        <form method="POST" action="/api/update">
          <button type="submit">Start update</button>
        </form>
        <a href="/api/update/status">View status</a>
        <a href="/">Open hub</a>
      </div>
    </div>
  </body>
</html>`);
});

app.post("/api/update", async (_req, res) => {
  if (updateProcess) {
    return res.status(409).json({ ok: false, error: "Update already running.", status: await readUpdateStatus() });
  }

  const minInterval = getUpdateMinIntervalSeconds();
  if (lastUpdateStartedAt && minInterval > 0) {
    const elapsed = Math.floor((Date.now() - lastUpdateStartedAt.getTime()) / 1000);
    if (elapsed < minInterval) {
      return res.status(429).json({
        ok: false,
        error: `Rate limited. Try again in ${minInterval - elapsed}s.`,
      });
    }
  }

  lastUpdateStartedAt = new Date();
  const updaterPath = path.join(__dirname, "updater.js");
  const maxSeconds = getUpdateMaxSeconds();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    updateStatusPath,
    JSON.stringify(
      { state: "running", message: "Update running", startedAt: lastUpdateStartedAt.toISOString(), finishedAt: null, updatedAt: new Date().toISOString() },
      null,
      2
    )
  );
  await fs.appendFile(updateLogPath, `\n\n=== Update started ${lastUpdateStartedAt.toISOString()} ===\n`);

  // Use a hard timeout so a stalled upstream request can't wedge the container forever.
  updateProcess = spawn("timeout", ["-k", "5", String(maxSeconds), process.execPath, updaterPath], {
    cwd: __dirname,
    stdio: "pipe",
    env: { ...process.env }
  });

  updateProcess.stdout.on("data", (d) => { fs.appendFile(updateLogPath, String(d)).catch(() => {}); });
  updateProcess.stderr.on("data", (d) => { fs.appendFile(updateLogPath, String(d)).catch(() => {}); });
  updateProcess.once("exit", (code) => {
    const finishedAt = new Date();
    const state = code === 0 ? "succeeded" : "failed";
    const message = code === 0 ? "Update finished" : `Update failed (exit ${code})`;
    updateProcess = null;
    fs.writeFile(
      updateStatusPath,
      JSON.stringify(
        { state, message, startedAt: lastUpdateStartedAt?.toISOString() ?? null, finishedAt: finishedAt.toISOString(), updatedAt: finishedAt.toISOString() },
        null,
        2
      )
    ).catch(() => {});
    fs.appendFile(updateLogPath, `\n=== Update finished ${finishedAt.toISOString()} (exit ${code}) ===\n`).catch(() => {});
  });

  res.status(202).json({ ok: true, status: await readUpdateStatus() });
});

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const entries of Object.values(nets)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.internal) continue;
      if (entry.family === "IPv4") ips.push(entry.address);
    }
  }
  return Array.from(new Set(ips));
}

app.listen(PORT, HOST, async () => {
  await fs.mkdir(dataDir, { recursive: true });
  console.log(`Dashboard running: http://localhost:${PORT}`);
  const host = os.hostname();
  const mdnsHost = host.endsWith(".local") ? host : `${host}.local`;
  console.log(`LAN (hostname): http://${mdnsHost}:${PORT}`);
  for (const ip of getLanIps()) console.log(`LAN: http://${ip}:${PORT}`);
});
