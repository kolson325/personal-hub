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

let deployProcess = null;

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

function requireUpdateToken(req, res, next) {
  const token = String(process.env.ALLSITEHUB_ADMIN_TOKEN ?? "").trim();
  if (!token) {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ ok: false, error: "Update disabled (missing ALLSITEHUB_ADMIN_TOKEN)." });
    }
    return next();
  }
  const got = String(req.get("x-admin-token") ?? req.query.token ?? "").trim();
  if (got && got === token) return next();
  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

app.post("/api/update", requireUpdateToken, async (_req, res) => {
  const updaterPath = path.join(__dirname, "updater.js");
  const child = spawn(process.execPath, [updaterPath], {
    cwd: __dirname,
    stdio: "pipe",
    env: { ...process.env }
  });
  let out = "";
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { out += d; });
  child.once("exit", (code) => {
    if (code === 0) res.json({ ok: true });
    else res.status(500).json({ ok: false, log: out.slice(-2000) });
  });
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
