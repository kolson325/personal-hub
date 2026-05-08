import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EnvSchema = z.object({
  SITEFOTOS_API_KEY: z.string().min(1),
  SITEFOTOS_ACCESS_CODE: z.string().optional(),
  SITEFOTOS_API_BASE_URL: z.string().url(),
  SITEFOTOS_API_BEARER: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase() === "true"),
  SITEFOTOS_ACCESS_CODE_HEADER: z.string().optional(),
  SITEFOTOS_ACCESS_CODE_QUERY_PARAM: z.string().optional(),
  SITEFOTOS_SEND_ACCESS_CODE_HEADER: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase() === "true"),
  SITEFOTOS_SEND_ACCESS_CODE_QUERY: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase() === "true"),
  DASHBOARD_TODAY: z.string().optional()
});

const EndpointsSchema = z.object({
  endpoints: z.record(
    z.object({
      path: z.string().min(1),
      method: z.enum(["GET", "POST"]).default("GET"),
      authHeader: z.string().optional()
      ,
      // Optional query params; values may include {{placeholders}} resolved at runtime.
      query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      // Optional JSON body for POST requests; values may include {{placeholders}} resolved at runtime.
      body: z.unknown().optional(),
      // Optional per-endpoint access code query param override (e.g. accessCode vs access_code)
      accessCodeQueryParam: z.string().optional(),
      // Optional per-endpoint access code header override
      accessCodeHeader: z.string().optional(),
      // Optional per-endpoint placement overrides
      sendAccessCodeHeader: z.boolean().optional(),
      sendAccessCodeQuery: z.boolean().optional(),
      // Optional per-endpoint toggle for sending API key header
      sendApiKey: z.boolean().optional(),
      // If true, failures are recorded but do not cause the updater to exit non-zero.
      optional: z.boolean().optional()
    })
  )
});

function isoToday() {
  const override = process.env.DASHBOARD_TODAY;
  if (override) return override;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekEpochSeconds(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay(); // 0=Sun .. 6=Sat
  // Week starts Monday 00:00 local
  const diff = (day === 0 ? -6 : 1 - day);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + diff);
  return Math.floor(date.getTime() / 1000);
}

function endOfWeekEpochSeconds(d = new Date()) {
  // "End" for reporting: now (local)
  return Math.floor(d.getTime() / 1000);
}

function startOfMonthEpochSeconds(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  return Math.floor(date.getTime() / 1000);
}

function daysAgoEpochSeconds(days, d = new Date()) {
  const date = new Date(d);
  date.setDate(date.getDate() - days);
  return Math.floor(date.getTime() / 1000);
}

function toEpochSecondsFromYmdLocal(ymd) {
  const m = String(ymd ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return Math.floor(new Date(y, mo - 1, d, 0, 0, 0, 0).getTime() / 1000);
}

function resolveTemplateVars() {
  const now = new Date();
  const today = isoToday();
  const weekStart = startOfWeekEpochSeconds(now);
  const weekEnd = endOfWeekEpochSeconds(now);
  const monthStart = startOfMonthEpochSeconds(now);
  const trackingStartYmd = process.env.TRACKING_START_DATE ?? "2026-04-01";
  const trackingStartEpoch = toEpochSecondsFromYmdLocal(trackingStartYmd) ?? daysAgoEpochSeconds(120, now);
  return {
    today,
    now_epoch: Math.floor(now.getTime() / 1000),
    week_start_epoch: weekStart,
    week_end_epoch: weekEnd,
    month_start_epoch: monthStart,
    last_30d_start_epoch: daysAgoEpochSeconds(30, now),
    tracking_start_epoch: trackingStartEpoch
  };
}

function renderTemplate(value, vars) {
  if (typeof value !== "string") return String(value);
  return value.replaceAll(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : ""
  );
}

function renderTemplatesDeep(value, vars) {
  if (typeof value === "string") return renderTemplate(value, vars);
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => renderTemplatesDeep(v, vars));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = renderTemplatesDeep(v, vars);
    return out;
  }
  return value;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function boolEnv(name, def) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return def;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "y";
}

function numberEnv(name, def) {
  const n = Number(process.env[name] ?? "");
  return Number.isFinite(n) ? n : def;
}

function timeoutSignal(ms) {
  const n = Number(ms);
  const timeoutMs = Number.isFinite(n) ? Math.max(1000, Math.floor(n)) : 20000;
  // Node 20+: AbortSignal.timeout is available.
  return AbortSignal.timeout(timeoutMs);
}

async function headCheckImage(url) {
  try {
    const res = await fetch(url, { method: "HEAD", signal: timeoutSignal(process.env.SITEFOTOS_FETCH_TIMEOUT_MS ?? 20000) });
    const len = Number(res.headers.get("content-length") ?? "");
    const type = res.headers.get("content-type") ?? "";
    return {
      ok: res.ok,
      status: res.status,
      contentLength: Number.isFinite(len) ? len : null,
      contentType: type
    };
  } catch (err) {
    return { ok: false, status: 0, contentLength: null, contentType: "", error: String(err?.message ?? err) };
  }
}

async function loadEndpoints() {
  const examplePath = path.join(__dirname, "config", "sitefotos.endpoints.example.json");
  const realPath = path.join(__dirname, "config", "sitefotos.endpoints.json");
  try {
    const raw = await fs.readFile(realPath, "utf8");
    return EndpointsSchema.parse(JSON.parse(raw));
  } catch {
    const raw = await fs.readFile(examplePath, "utf8");
    return EndpointsSchema.parse(JSON.parse(raw));
  }
}

async function apiFetch({ baseUrl, apiKey, bearer }, endpoint) {
  const urlObj = new URL(endpoint.path, baseUrl);
  const authHeader = endpoint.authHeader ?? "Authorization";

  const accessCode = process.env.SITEFOTOS_ACCESS_CODE;
  const accessHeader = endpoint.accessCodeHeader ?? process.env.SITEFOTOS_ACCESS_CODE_HEADER ?? "X-Access-Code";
  const accessQuery =
    endpoint.accessCodeQueryParam ?? process.env.SITEFOTOS_ACCESS_CODE_QUERY_PARAM ?? "access_code";
  const sendAccessHeader =
    endpoint.sendAccessCodeHeader ??
    ((process.env.SITEFOTOS_SEND_ACCESS_CODE_HEADER ?? "true").toLowerCase() === "true");
  const sendAccessQuery =
    endpoint.sendAccessCodeQuery ??
    ((process.env.SITEFOTOS_SEND_ACCESS_CODE_QUERY ?? "false").toLowerCase() === "true");

  // Add endpoint query params (supports {{vars}} placeholders).
  const vars = resolveTemplateVars();
  if (endpoint.query) {
    for (const [k, v] of Object.entries(endpoint.query)) {
      urlObj.searchParams.set(k, renderTemplate(v, vars));
    }
  }

  const requestBody =
    endpoint.method === "POST" && typeof endpoint.body !== "undefined"
      ? JSON.stringify(renderTemplatesDeep(endpoint.body, vars))
      : undefined;

  // Try a few common auth schemes. This helps when docs are unclear.
  const sendApiKey = endpoint.sendApiKey ?? true;
  const authVariants = sendApiKey
    ? [
        // Bearer in Authorization
        ...(bearer ? [`Authorization:Bearer ${apiKey}`] : []),
        // Raw in Authorization
        `Authorization:Raw ${apiKey}`,
        // API key style headers
        `X-API-Key:${apiKey}`,
        `X-Api-Key:${apiKey}`,
        `x-api-key:${apiKey}`
      ]
    : ["Authorization:Raw "]; // placeholder; will be ignored

  const accessVariants = accessCode
    ? [
        { header: sendAccessHeader, query: false },
        { header: false, query: sendAccessQuery },
        { header: sendAccessHeader, query: sendAccessQuery }
      ]
    : [{ header: false, query: false }];

  let lastErr = null;

  for (const authVariant of authVariants) {
    for (const accessPlacement of accessVariants) {
      const headers = { Accept: "application/json" };
      if (sendApiKey) {
        const [hNameRaw, hValueRaw] = authVariant.split(":", 2);
        const hName = hNameRaw.trim();
        const hValue = hValueRaw.trim();
        if (hName === "Authorization") {
          // Authorization value variants need the right prefix format.
          if (hValue.startsWith("Bearer ")) headers.Authorization = hValue;
          else if (hValue.startsWith("Bearer")) headers.Authorization = hValue.replace(/^Bearer\s*/, "Bearer ");
          else if (hValue.startsWith("Raw ")) headers.Authorization = hValue.slice(4);
          else headers.Authorization = hValue;
        } else {
          headers[hName] = hValue;
        }
      }

      const tryUrlObj = new URL(urlObj.toString());
      if (accessCode) {
        if (accessPlacement.header) headers[accessHeader] = accessCode;
        if (accessPlacement.query) tryUrlObj.searchParams.set(accessQuery, accessCode);
      }

      const url = tryUrlObj.toString();
      let res;
      let text = "";
      let contentType = "";

      // Basic 429 handling: retry with backoff (sitefotos rate limits can be tight).
      for (let attempt = 0; attempt < 4; attempt++) {
        if (requestBody && !headers["content-type"]) headers["content-type"] = "application/json";
        res = await fetch(url, {
          method: endpoint.method,
          headers,
          body: requestBody,
          signal: timeoutSignal(process.env.SITEFOTOS_FETCH_TIMEOUT_MS ?? 20000)
        });
        contentType = res.headers.get("content-type") ?? "";
        text = await res.text();
        if (res.status !== 429) break;

        const retryAfter = Number(res.headers.get("retry-after") ?? "");
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1);
        await sleep(waitMs);
      }

      // If we're still rate-limited after retries, bail out (don't cycle auth variants; it makes 429 worse).
      if (res.status === 429) {
        const safeUrl = url
          .replaceAll(apiKey, "***REDACTED***")
          .replaceAll(String(accessCode ?? ""), "***REDACTED***");
        throw new Error(`Rate limited (429) on ${endpoint.method} ${safeUrl}`);
      }

      if (res.ok) {
        if (!contentType.includes("application/json")) return { _raw: text };
        return JSON.parse(text);
      }

      // Redact secrets from any logged URL/error.
      const safeUrl = url
        .replaceAll(apiKey, "***REDACTED***")
        .replaceAll(String(accessCode ?? ""), "***REDACTED***");
      const safeText = text
        .replaceAll(apiKey, "***REDACTED***")
        .replaceAll(String(accessCode ?? ""), "***REDACTED***");
      lastErr = new Error(`Fetch failed ${endpoint.method} ${safeUrl}: ${res.status} ${safeText.slice(0, 300)}`);

      // If it's not auth-related, don't keep retrying *unless* we're still cycling
      // through auth/access-code variants (some endpoints return 404/redirect when unauthenticated).
      const isAuthStatus = res.status === 401 || res.status === 403;
      const tryingVariants = authVariants.length > 1 || accessVariants.length > 1;
      if (!isAuthStatus && !tryingVariants) throw lastErr;
    }
  }

  throw lastErr ?? new Error("Fetch failed (unknown error)");
}

async function main() {
  const env = EnvSchema.parse(process.env);
  const endpoints = await loadEndpoints();

  const startedAt = new Date().toISOString();
  const today = isoToday();

  const results = {};
  const errors = {};

  for (const [key, endpoint] of Object.entries(endpoints.endpoints)) {
    try {
      results[key] = await apiFetch(
        { baseUrl: env.SITEFOTOS_API_BASE_URL, apiKey: env.SITEFOTOS_API_KEY, bearer: env.SITEFOTOS_API_BEARER },
        endpoint
      );
    } catch (err) {
      errors[key] = String(err?.message ?? err);
      if (endpoint.optional) {
        // Optional endpoints shouldn't fail the whole run.
        continue;
      }
    }
  }

  // Extra: build a wider site catalog by fetching multiple 30-day windows of submissions.
  // SiteFotos rejects submitted-form requests spanning > 30 days, so we chunk.
  try {
    const vars = resolveTemplateVars();
    const lookbackDays = Math.max(30, Math.floor(numberEnv("SITE_CATALOG_LOOKBACK_DAYS", 365)));
    const maxWindows = Math.max(1, Math.floor(numberEnv("SITE_CATALOG_MAX_WINDOWS", 8)));
    const nowEpoch = Number(vars.now_epoch) || Math.floor(Date.now() / 1000);
    const trackingStartEpoch = Number(vars.tracking_start_epoch) || nowEpoch - lookbackDays * 86400;
    const minStart = Math.max(trackingStartEpoch, nowEpoch - lookbackDays * 86400);

    const windows = [];
    // Keep each window strictly under 30 days to satisfy upstream validation.
    const windowSeconds = 30 * 86400 - 2;
    let endEpoch = nowEpoch;
    let i = 0;
    while (endEpoch > minStart && i < maxWindows) {
      const startEpoch = Math.max(minStart, endEpoch - windowSeconds);
      windows.push({ startEpoch, endEpoch });
      endEpoch = startEpoch - 1;
      i += 1;
    }

    const submissionsByWindow = [];
    for (const w of windows) {
      const payload = await apiFetch(
        { baseUrl: env.SITEFOTOS_API_BASE_URL, apiKey: env.SITEFOTOS_API_KEY, bearer: env.SITEFOTOS_API_BEARER },
        {
          path: "/v1/api/form/submitted",
          method: "GET",
          query: { start_date: w.startEpoch, end_date: w.endEpoch }
        }
      );
      submissionsByWindow.push({ ...w, count: Array.isArray(payload) ? payload.length : 0, items: payload });
      // small spacing to reduce rate-limit risk
      await sleep(120);
    }
    results.submittedFormsForCatalog = submissionsByWindow;
  } catch (err) {
    errors.submittedFormsForCatalog = String(err?.message ?? err);
  }

  // Enrich: fetch detailed submissions for the last ~8 days so we can compute true
  // per-site completion/issue status without opening SiteFotos.
  try {
    const detailLimit = Math.max(5, Math.floor(numberEnv("SUBMISSION_DETAIL_LIMIT", 25)));
    const enableImageChecks = boolEnv("ENABLE_IMAGE_HEAD_CHECKS", false);
    const perDetailSleepMs = Math.max(0, Math.floor(numberEnv("SUBMISSION_DETAIL_SLEEP_MS", 75)));

    const submissions = Array.isArray(results.submittedFormsLast30Days) ? results.submittedFormsLast30Days : [];
    const nowEpoch = Math.floor(Date.now() / 1000);
    const cutoff = nowEpoch - 8 * 24 * 60 * 60;
    const wantedForms = new Set([
      "KeyBank - Regularly Scheduled Landscape Services",
      "KeyBank - Out of Scope - Landscape",
      "Manager Site Visit",
      "KeyBank - Spring Clean Up",
      "KeyBank - Fertilization",
      "KeyBank - Fall Clean Up"
    ]);

    const recent = submissions
      .filter((s) => typeof s?.form_created === "number" && s.form_created >= cutoff)
      .filter((s) => !s?.form_name || wantedForms.has(s.form_name))
      .sort((a, b) => (b.form_created ?? 0) - (a.form_created ?? 0))
      .slice(0, detailLimit);

    const uniqueIds = Array.from(
      new Set(recent.map((s) => s?.form_sumission_id).filter((id) => typeof id === "number" && id > 0))
    );

    const details = {};
    const imageChecks = {};
    let fetched = 0;
    for (const id of uniqueIds) {
      try {
        const detail = await apiFetch(
          { baseUrl: env.SITEFOTOS_API_BASE_URL, apiKey: env.SITEFOTOS_API_KEY, bearer: env.SITEFOTOS_API_BEARER },
          { path: `/v1/api/form/submission/${id}`, method: "GET" }
        );
        // API returns an array with 1 item.
        if (Array.isArray(detail) && detail[0]) {
          details[String(id)] = detail[0];
          if (enableImageChecks) {
            // Optional "suspect" detection: HEAD-check up to 3 images (broken links / tiny files).
            try {
              const formJson = JSON.parse(detail[0].form_json ?? "{}");
              const urls = [];
              for (const p of formJson.pages ?? []) {
                for (const e of p.elements ?? []) {
                  if (e?.type === "file" && Array.isArray(e.value)) {
                    for (const item of e.value) {
                      if (typeof item === "string" && item.startsWith("http")) urls.push(item);
                      else if (item?.lrImageURL) urls.push(item.lrImageURL);
                    }
                  }
                  if (e?.type === "service") {
                    for (const se of e.elements ?? []) {
                      if (se?.type === "file" && Array.isArray(se.value)) {
                        for (const item of se.value) {
                          if (typeof item === "string" && item.startsWith("http")) urls.push(item);
                          else if (item?.lrImageURL) urls.push(item.lrImageURL);
                        }
                      }
                    }
                  }
                }
              }
              const uniq = Array.from(new Set(urls)).slice(0, 3);
              const checks = [];
              for (const u of uniq) {
                const c = await headCheckImage(u);
                checks.push({ url: u, ...c });
                await sleep(120);
              }
              if (checks.length) imageChecks[String(id)] = checks;
            } catch {
              // ignore parsing/check errors
            }
          }
        }
      } catch (err) {
        // Don't fail the overall run; rate limits happen.
        errors[`submission:${id}`] = String(err?.message ?? err);
      }
      // Small spacing to reduce 429 risk.
      if (perDetailSleepMs) await sleep(perDetailSleepMs);
      fetched += 1;
      if (fetched % 10 === 0) console.log(`Fetched submission details: ${fetched}/${uniqueIds.length}`);
    }

    results.submissionDetails = details;
    results.imageChecks = imageChecks;
  } catch (err) {
    errors.submissionDetails = String(err?.message ?? err);
  }

  const snapshot = {
    meta: {
      startedAt,
      today,
      apiBaseUrl: env.SITEFOTOS_API_BASE_URL,
      endpointKeys: Object.keys(endpoints.endpoints),
      errorKeys: Object.keys(errors)
    },
    data: results,
    errors
  };

  const dataDir = path.join(__dirname, "data");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "snapshot.json"), JSON.stringify(snapshot, null, 2));
  console.log(`Wrote snapshot: ${path.join(dataDir, "snapshot.json")}`);
  // Exit non-zero only if a non-optional endpoint failed.
  const requiredFailures = Object.entries(endpoints.endpoints)
    .filter(([k, e]) => !e.optional && Object.prototype.hasOwnProperty.call(errors, k))
    .map(([k]) => k);
  if (requiredFailures.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
