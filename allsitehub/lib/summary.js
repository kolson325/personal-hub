// Summary builder for SiteFotos snapshots (pure functions; no server code).
// This module is ESM and is imported by server.js.

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "object") {
    if (Array.isArray(value.data)) return value.data;
    if (Array.isArray(value.items)) return value.items;
    if (Array.isArray(value.results)) return value.results;
  }
  return [];
}

function asString(value) {
  if (value == null) return "";
  return String(value);
}

function toEpochSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 2_000_000_000 ? Math.floor(value / 1000) : value;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 2_000_000_000 ? Math.floor(n / 1000) : n;
}

function normalizeSite(value) {
  return asString(value || "").trim() || "Unknown site";
}

function normalizeVendor(value) {
  return asString(value || "").trim() || "Unknown vendor";
}

function extractSubmissionId(raw) {
  for (const key of ["form_sumission_id", "Submission ID", "submissionId", "submission_id", "id"]) {
    if (raw && raw[key] != null) {
      const n = Number(raw[key]);
      return Number.isFinite(n) ? n : raw[key];
    }
  }
  return null;
}

function extractFormName(raw) {
  return (
    asString(raw?.form_name ?? raw?.["Form Name"] ?? raw?.formName ?? raw?.form ?? "")
      .trim() || "Form"
  );
}

function extractFormId(raw) {
  for (const key of ["form_id", "sf_id", "Form ID", "formId"]) {
    if (raw && raw[key] != null) {
      const n = Number(raw[key]);
      return Number.isFinite(n) ? n : raw[key];
    }
  }
  return null;
}

function extractVendor(raw) {
  // Prefer explicit contractor fields if present; fall back to email.
  const v =
    raw?.vendor ??
    raw?.contractor ??
    raw?.Contractor ??
    raw?.company ??
    raw?.Company ??
    raw?.["Vendor"] ??
    raw?.["Vendor Name"];
  const email = raw?.form_uploader_email ?? raw?.Email ?? raw?.email;
  const best = asString(v || email || "").trim();
  return normalizeVendor(best);
}

function extractCreated(raw) {
  // SiteFotos API format uses form_created / form_checkout / form_checkin.
  const candidates = [
    raw?.form_created,
    raw?.form_checkout,
    raw?.form_checkin,
    raw?.Date,
    raw?.date,
    raw?.created,
    raw?.createdAt,
    raw?.created_at,
    raw?.CheckOut,
    raw?.checkout,
    raw?.CheckIn,
    raw?.checkin
  ];
  for (const c of candidates) {
    const s = toEpochSeconds(c);
    if (s) return s;
  }
  return null;
}

function extractPhotoUrlsFromFormJson(formData, urls) {
  if (!formData || typeof formData !== "object") return;
  if (Array.isArray(formData)) {
    for (const item of formData) extractPhotoUrlsFromFormJson(item, urls);
    return;
  }
  // File elements have type="file" and a value array with {lrImageURL, ...}
  if (formData.type === "file" && Array.isArray(formData.value)) {
    for (const photo of formData.value) {
      const url = photo?.lrImageURL ?? photo?.hrImageURL ?? photo?.url;
      if (typeof url === "string" && url.startsWith("http")) urls.push(url);
    }
  }
  for (const key of ["pages", "elements", "choices"]) {
    if (Array.isArray(formData[key])) {
      for (const child of formData[key]) extractPhotoUrlsFromFormJson(child, urls);
    }
  }
}

function extractPhotoUrls(raw) {
  const urls = [];
  if (!raw || typeof raw !== "object") return urls;
  // SiteFotos API: photos are inside form_json (a JSON string)
  if (typeof raw.form_json === "string") {
    try {
      extractPhotoUrlsFromFormJson(JSON.parse(raw.form_json), urls);
    } catch {}
  }
  for (const [k, v] of Object.entries(raw)) {
    if (k === "form_json") continue;
    if (!v) continue;
    if (typeof v === "string") {
      if (v.startsWith("http") && /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(v)) urls.push(v);
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.startsWith("http")) urls.push(item);
      }
      continue;
    }
    if (typeof v === "object") {
      const maybe = v.url ?? v.href ?? v.uri ?? v.lrImageURL;
      if (typeof maybe === "string" && maybe.startsWith("http")) urls.push(maybe);
    }
  }
  return Array.from(new Set(urls));
}

function extractNotes(raw) {
  const notes = [];
  if (!raw || typeof raw !== "object") return notes;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") continue;
    const key = k.toLowerCase();
    const val = v.trim();
    if (!val) continue;
    if (key.includes("note")) notes.push(val);
    if (val.includes("Not Completed")) notes.push(`${k}: ${val}`);
    if (val.includes("No Photos")) notes.push(`${k}: ${val}`);
  }
  return Array.from(new Set(notes)).slice(0, 8);
}

function computeFlags(raw) {
  // Heuristic signals:
  // - suspect: missing photos OR any "Not Completed" item
  // - critical: very likely bad (multiple "Not Completed" + no photos)
  let notCompleted = 0;
  let noPhotos = 0;
  const reasons = [];

  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== "string") continue;
      if (v.includes("Not Completed")) {
        notCompleted += 1;
        if (reasons.length < 5) reasons.push(`${k}: Not Completed`);
      }
      if (v === "No Photos" || v.includes("No Photos")) {
        noPhotos += 1;
        if (reasons.length < 5) reasons.push(`${k}: No Photos`);
      }
    }
  }

  const suspect = notCompleted > 0 || noPhotos > 0;
  const critical = notCompleted >= 3 && noPhotos >= 2;

  return { suspect, critical, reasons };
}

function extractEmail(raw) {
  return asString(raw?.form_uploader_email ?? raw?.Email ?? raw?.email ?? "").trim();
}

function splitEmails(csvLike) {
  return asString(csvLike)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildFormCatalog(snapshot) {
  const byId = new Map();
  const byName = new Map();

  // /v1/api/form shape
  const forms = asArray(snapshot?.data?.forms);
  for (const f of forms) {
    const formId = Number(f?.form_id);
    const formName = asString(f?.form_name).trim();
    if (!Number.isFinite(formId) || !formName) continue;
    const meta = {
      id: formId,
      name: formName,
      type: null,
      configuredEmails: []
    };
    byId.set(formId, meta);
    byName.set(formName, meta);
  }

  // /node/forms/forms2 shape
  const forms2 = asArray(snapshot?.data?.forms2);
  for (const f of forms2) {
    const formId = Number(f?.sf_id);
    const formName = asString(f?.sf_form_name).trim();
    if (!Number.isFinite(formId) || !formName) continue;
    const previous = byId.get(formId) ?? byName.get(formName) ?? {
      id: formId,
      name: formName,
      type: null,
      configuredEmails: []
    };
    const merged = {
      id: formId,
      name: formName,
      type: asString(f?.sf_form_type).trim() || previous.type || null,
      configuredEmails: Array.from(new Set([...previous.configuredEmails, ...splitEmails(f?.sf_form_emails)]))
    };
    byId.set(formId, merged);
    byName.set(formName, merged);
  }

  return { byId, byName };
}

function findFormMeta(formCatalog, formId, formName) {
  if (!formCatalog) return null;
  if (formId != null && formCatalog.byId.has(formId)) return formCatalog.byId.get(formId);
  if (formName && formCatalog.byName.has(formName)) return formCatalog.byName.get(formName);
  return null;
}

function normalizeSubmission(raw, formCatalog) {
  const site = normalizeSite(
    raw?.form_site ?? raw?.Building ?? raw?.building ?? raw?.site ?? raw?.location
  );
  const vendor = extractVendor(raw);
  const created = extractCreated(raw);
  const submissionId = extractSubmissionId(raw);
  const formId = extractFormId(raw);
  const formName = extractFormName(raw);
  const photoUrls = extractPhotoUrls(raw);
  const notes = extractNotes(raw);
  const { suspect, critical, reasons } = computeFlags(raw);
  const email = extractEmail(raw);
  const formMeta = findFormMeta(formCatalog, formId, formName);

  // If there are photos, we relax critical (user wants "super bad only").
  const criticalAdjusted = critical && photoUrls.length === 0;

  return {
    site,
    vendor,
    email,
    created,
    submissionId,
    formId,
    formName,
    formType: formMeta?.type ?? null,
    configuredEmails: formMeta?.configuredEmails ?? [],
    photoUrls,
    notes,
    suspect,
    critical: criticalAdjusted,
    reasons
  };
}

function filterByRange(submissions, startSec, endSec) {
  return submissions.filter((s) => {
    const t = Number(s?.created ?? 0) || 0;
    return t >= startSec && t <= endSec;
  });
}

function periodSummary(items) {
  const timeline = items
    .slice()
    .sort((a, b) => (Number(b.created ?? 0) || 0) - (Number(a.created ?? 0) || 0))
    .slice(0, 500)
    .map((s) => ({
      site: s.site,
      vendor: s.vendor,
      email: s.email,
      created: s.created,
      submissionId: s.submissionId,
      formId: s.formId,
      formName: s.formName,
      formType: s.formType,
      configuredEmails: asArray(s.configuredEmails),
      suspect: !!s.suspect,
      reasons: asArray(s.reasons),
      photoUrls: asArray(s.photoUrls)
    }));

  const critical = timeline.filter((t) => t && t.suspect && items.find((s) => s.submissionId === t.submissionId)?.critical);
  const withIssues = timeline.some((t) => t && t.suspect);

  return {
    total: timeline.length,
    withIssues,
    timeline,
    critical: critical.slice(0, 50)
  };
}

function startOfDayLocal(epochSec) {
  const d = new Date(epochSec * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function startOfDayEpochFromYmdLocal(ymd) {
  const m = asString(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Math.floor(dt.getTime() / 1000);
}

function endOfDayEpochFromYmdLocal(ymd) {
  const start = startOfDayEpochFromYmdLocal(ymd);
  if (start == null) return null;
  return start + 86400 - 1;
}

function nextMondayStartEpoch(afterEpochSec) {
  const d = new Date(afterEpochSec * 1000);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1); // exclusive
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1); // 1 = Monday
  return Math.floor(d.getTime() / 1000);
}

function trackingWeekForNow(nowEpochSec, startYmd, week1EndYmd) {
  const start = startOfDayEpochFromYmdLocal(startYmd);
  const week1End = endOfDayEpochFromYmdLocal(week1EndYmd);
  if (start == null || week1End == null) return null;

  // Week 1 is a special kickoff window.
  if (nowEpochSec <= week1End) {
    return { programWeek: 1, start, end: Math.min(nowEpochSec, week1End), label: "Week 1 (kickoff)" };
  }

  const week2Start = nextMondayStartEpoch(week1End);

  // Monday->Friday windows. If on weekend, treat as last completed week.
  const now = new Date(nowEpochSec * 1000);
  const day = now.getDay(); // 0=Sun .. 6=Sat
  let effectiveNowEpochSec = nowEpochSec;
  if (day === 0) effectiveNowEpochSec = nowEpochSec - 86400 * 2; // Sunday -> Friday
  if (day === 6) effectiveNowEpochSec = nowEpochSec - 86400; // Saturday -> Friday

  const weeksSince = Math.floor((effectiveNowEpochSec - week2Start) / (86400 * 7));
  const programWeek = 2 + Math.max(0, weeksSince);
  const startEpoch = week2Start + weeksSince * 86400 * 7;
  const fullEndEpoch = startEpoch + 86400 * 5 - 1; // Friday 23:59:59

  return { programWeek, start: startEpoch, end: Math.min(nowEpochSec, fullEndEpoch), label: `Week ${programWeek}` };
}

function extractSubmissions(snapshot) {
  // Structured snapshot: { data: { submittedFormsLast30Days: [...] } }
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const forms = snapshot?.data?.submittedFormsLast30Days;
    if (Array.isArray(forms)) return forms;
  }
  return asArray(snapshot);
}

function asStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => asString(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function normalizeSiteRow(raw) {
  const id = Number(raw?.SITEID ?? raw?.site_id ?? raw?.id);
  const name = asString(raw?.SITENAME ?? raw?.nickname ?? raw?.site_name ?? raw?.name ?? raw?.site).trim();
  if (!name) return null;
  const city = asString(raw?.CITYNAME ?? raw?.city ?? "").trim() || null;
  const state = asString(raw?.STATENAME ?? raw?.state ?? "").trim() || null;
  const zip = asString(raw?.ZIPCODE ?? raw?.zip ?? "").trim() || null;
  const client = asString(raw?.site_contact_primary ?? raw?.CLIENTNAME ?? raw?.client ?? "").trim() || null;
  const trades = asStringArray(raw?.TRADES ?? raw?.trades);
  const forms = asStringArray(raw?.FORMNAMES ?? raw?.forms);
  const contractors = asStringArray(raw?.CONTRACTORNAMES ?? raw?.contractors);
  const status = asString(raw?.STATUS ?? raw?.status ?? "").trim() || null;
  const lat = raw?.lat != null ? Number(raw.lat) : null;
  const lng = raw?.lng != null ? Number(raw.lng) : null;
  return {
    id: Number.isFinite(id) ? id : null,
    name,
    city,
    state,
    zip,
    client,
    trades,
    forms,
    contractors,
    status,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null
  };
}

function extractSiteCatalog(snapshot) {
  const rows = asArray(snapshot?.data?.sites ?? snapshot?.data?.sitesTabulator);
  if (!rows.length) return null;
  const sites = rows.map((r) => normalizeSiteRow(r)).filter(Boolean);
  const regularlyScheduledSiteNames = sites
    // Prefer explicit form list when available; otherwise approximate using trade.
    .filter((s) => {
      if (Array.isArray(s.forms) && s.forms.length) return s.forms.some((f) => /regularly\s+scheduled/i.test(String(f)));
      return Array.isArray(s.trades) && s.trades.some((t) => /landscap/i.test(String(t)));
    })
    .map((s) => s.name);
  return {
    totalSites: sites.length,
    sites,
    regularlyScheduledSiteNames: Array.from(new Set(regularlyScheduledSiteNames))
  };
}

function extractSiteCatalogFromSubmissions(snapshot) {
  const windows = asArray(snapshot?.data?.submittedFormsForCatalog);
  if (!windows.length) return null;
  const names = new Set();
  const regular = new Set();
  for (const w of windows) {
    const items = Array.isArray(w?.items) ? w.items : [];
    for (const raw of items) {
      const site = normalizeSite(raw?.form_site ?? raw?.Building ?? raw?.building ?? raw?.site ?? raw?.location);
      if (!site) continue;
      names.add(site);
      const formName = extractFormName(raw);
      if (/regularly\s+scheduled/i.test(formName)) regular.add(site);
    }
  }
  const sites = Array.from(names).map((name) => ({ id: null, name, city: null, state: null, zip: null, client: null, trades: [], forms: [], contractors: [], status: null }));
  return {
    totalSites: sites.length,
    sites,
    regularlyScheduledSiteNames: Array.from(regular)
  };
}

export function buildSummary(snapshot, nowEpochSec = Math.floor(Date.now() / 1000)) {
  const formCatalog = buildFormCatalog(snapshot);
  const rows = extractSubmissions(snapshot);
  const submissions = rows.map((row) => normalizeSubmission(row, formCatalog)).filter((s) => s && s.site);

  const todayStart = startOfDayLocal(nowEpochSec);
  const yesterdayStart = todayStart - 86400;
  const weekStart = todayStart - 86400 * 7;
  const monthStart = todayStart - 86400 * 30;

  const periods = {
    today: periodSummary(filterByRange(submissions, todayStart, nowEpochSec)),
    yesterday: periodSummary(filterByRange(submissions, yesterdayStart, todayStart - 1)),
    week: periodSummary(filterByRange(submissions, weekStart, nowEpochSec)),
    month: periodSummary(filterByRange(submissions, monthStart, nowEpochSec))
  };

  const trackingStart = process.env.TRACKING_START_DATE ?? "2026-04-01";
  const trackingWeek1End = process.env.TRACKING_WEEK1_END_DATE ?? "2026-04-10";
  const trackingWeek = trackingWeekForNow(nowEpochSec, trackingStart, trackingWeek1End);
  const trackingMonth = (() => {
    const m = asString(trackingStart).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return 1;
    const baseY = Number(m[1]);
    const baseM = Number(m[2]);
    if (!Number.isFinite(baseY) || !Number.isFinite(baseM)) return 1;
    const now = new Date(nowEpochSec * 1000);
    const diff = (now.getFullYear() - baseY) * 12 + (now.getMonth() + 1 - baseM);
    return Math.max(1, diff + 1);
  })();
  const trackingWeekInMonth = (() => {
    if (!trackingWeek) return 1;
    if (trackingMonth === 1) return trackingWeek.programWeek;
    const now = new Date(nowEpochSec * 1000);
    const effective = new Date(now);
    const day = effective.getDay();
    if (day === 6) effective.setDate(effective.getDate() - 1);
    if (day === 0) effective.setDate(effective.getDate() - 2);
    effective.setHours(0, 0, 0, 0);
    const monthStart = new Date(effective.getFullYear(), effective.getMonth(), 1, 0, 0, 0, 0);
    const firstMon = new Date(monthStart);
    while (firstMon.getDay() !== 1) firstMon.setDate(firstMon.getDate() + 1);
    const days = Math.max(0, Math.floor((effective.getTime() - firstMon.getTime()) / (86400 * 1000)));
    return 1 + Math.floor(days / 7);
  })();
  const tracking = trackingWeek
    ? {
        startDate: trackingStart,
        week1EndDate: trackingWeek1End,
        month: trackingMonth,
        week: trackingWeekInMonth,
        programWeek: trackingWeek.programWeek,
        currentWeek: {
          programWeek: trackingWeek.programWeek,
          label: trackingWeek.label,
          start: trackingWeek.start,
          end: trackingWeek.end,
          summary: periodSummary(filterByRange(submissions, trackingWeek.start, trackingWeek.end))
        }
      }
    : null;

  return {
    generatedAt: nowEpochSec,
    snapshotCreatedAt: asString(snapshot?.meta?.startedAt ?? "").trim() || null,
    formCatalog: [...formCatalog.byId.values()].map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      configuredEmails: asArray(f.configuredEmails)
    })),
    periods,
    tracking,
    siteCatalog: extractSiteCatalog(snapshot) ?? extractSiteCatalogFromSubmissions(snapshot)
  };
}

export function buildSiteDetails(snapshot, siteRaw) {
  const site = normalizeSite(siteRaw);
  const formCatalog = buildFormCatalog(snapshot);
  const rows = extractSubmissions(snapshot);
  const submissions = rows
    .map((row) => normalizeSubmission(row, formCatalog))
    .filter((s) => s.site === site)
    .sort((a, b) => (Number(b.created ?? 0) || 0) - (Number(a.created ?? 0) || 0));

  const latest = submissions[0] ?? null;
  const photos = [];
  for (const s of submissions) photos.push(...asArray(s.photoUrls));

  return {
    site,
    latest,
    photos: Array.from(new Set(photos)),
    submissions: submissions.slice(0, 100).map((s) => ({
      vendor: s.vendor,
      created: s.created,
      submissionId: s.submissionId,
      formId: s.formId,
      formName: s.formName,
      formType: s.formType,
      suspect: !!s.suspect,
      notes: asArray(s.notes)
    }))
  };
}
