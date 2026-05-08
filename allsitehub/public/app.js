import { el, card, kvRow } from "./util.js";

const grid = document.getElementById("grid");
const subtitle = document.getElementById("subtitle");
const refreshBtn = document.getElementById("refreshBtn");
const periodBtns = document.getElementById("periodBtns");

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" }
];

const REGIONS = [
  {
    key: "cincinnati",
    label: "Cincinnati",
    keywords: ["cincinnati", "blue ash", "monfort heights", "western hills", "hyde park", "anderson", "kenwood", "symmes", "mason", "west chester", "loveland", "milford", "batavia", "norwood", "oakley", "delhi", "westwood", "covington", "florence", "newport", "alexandria"]
  },
  {
    key: "dayton",
    label: "Dayton",
    keywords: ["dayton", "beavercreek", "fairborn", "kettering", "huber heights", "miamisburg", "springboro", "troy", "piqua", "xenia", "centerville", "oakwood", "trotwood", "moraine"]
  },
  {
    key: "pittsburgh",
    label: "Pittsburgh",
    keywords: ["pittsburgh", "uniontown", "plum", "cranberry", "monroeville", "bethel park", "mount lebanon", "penn hills", "greensburg", "butler", "new kensington", "mckeesport", "canonsburg", "washington pa"]
  },
  {
    key: "toledo",
    label: "Toledo",
    keywords: ["toledo", "findlay", "maumee", "sylvania", "perrysburg", "bowling green", "sandusky", "fremont", "defiance", "napoleon", "bryan", "wauseon"]
  }
];

const REGION_CENTERS = {
  cincinnati: { lat: 39.1031, lng: -84.5120 },
  dayton: { lat: 39.7589, lng: -84.1916 },
  toledo: { lat: 41.6528, lng: -83.5379 },
  pittsburgh: { lat: 40.4406, lng: -79.9959 }
};

function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8; // earth radius miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function classifyRegion(meta, siteName) {
  const state = String(meta?.state ?? "").toUpperCase();
  const lat = Number(meta?.lat);
  const lng = Number(meta?.lng);
  if (state === "PA") return "pittsburgh";
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const distances = [
      ["cincinnati", haversineMiles(lat, lng, REGION_CENTERS.cincinnati.lat, REGION_CENTERS.cincinnati.lng)],
      ["dayton", haversineMiles(lat, lng, REGION_CENTERS.dayton.lat, REGION_CENTERS.dayton.lng)],
      ["toledo", haversineMiles(lat, lng, REGION_CENTERS.toledo.lat, REGION_CENTERS.toledo.lng)]
    ];
    distances.sort((a, b) => a[1] - b[1]);
    return distances[0]?.[0] ?? null;
  }

  // Fallback: keyword match on name/city/state string.
  const lowerName = String(siteName ?? "").toLowerCase();
  const lowerCity = String(meta?.city ?? "").toLowerCase();
  const lowerState = String(meta?.state ?? "").toLowerCase();
  const lower = `${lowerName} ${lowerCity} ${lowerState}`;
  for (const r of REGIONS) {
    if (r.key === "pittsburgh") continue;
    if (r.keywords.some((kw) => lower.includes(kw))) return r.key;
  }
  return null;
}

function siteMatchesRegion(siteName, regionKey) {
  if (!regionKey) return true;
  const region = REGIONS.find((r) => r.key === regionKey);
  if (!region) return true;
  const lowerName = String(siteName ?? "").toLowerCase();
  const meta = siteMetaByName.get(String(siteName ?? "").trim()) || null;
  const lowerCity = String(meta?.city ?? "").toLowerCase();
  const lowerState = String(meta?.state ?? "").toLowerCase();
  const lower = `${lowerName} ${lowerCity} ${lowerState}`;

  // If we have structured metadata, prefer it.
  if (meta) {
    const bucket = classifyRegion(meta, siteName);
    if (bucket) return bucket === regionKey;
  }

  return region.keywords.some((kw) => lower.includes(kw));
}

function siteMatchesPittsburghBrand(siteName, brand) {
  if (!brand) return true;
  const lower = String(siteName ?? "").toLowerCase();
  if (brand === "keybank") return lower.includes("keybank");
  if (brand === "getgo") return lower.includes("getgo") || lower.includes("get go");
  return true;
}

function matchesScope(siteName, regionKey, pittsburghBrand) {
  return siteMatchesRegion(siteName, regionKey) && (regionKey !== "pittsburgh" || siteMatchesPittsburghBrand(siteName, pittsburghBrand));
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
}

function isRegularlyScheduledForm(formName) {
  return /regularly\s+scheduled/i.test(String(formName ?? ""));
}

function weekOfMonth1to4(epochSec) {
  const d = new Date(Number(epochSec ?? 0) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  return Math.min(4, Math.max(1, Math.ceil(day / 7)));
}

function getCycleBaseDate(now = new Date()) {
  const year = now.getFullYear();
  const aprilFirst = new Date(year, 3, 1, 0, 0, 0, 0);
  if (now >= aprilFirst) return aprilFirst;
  return new Date(year - 1, 3, 1, 0, 0, 0, 0);
}

function getCycleMonthWeek(epochSec, baseDate = getCycleBaseDate()) {
  const d = new Date(Number(epochSec ?? 0) * 1000);
  if (Number.isNaN(d.getTime())) return { month: 1, week: 1, termIndex: 0 };

  // Tracking calendar:
  // - Month 1 starts April 1
  // - Week 1 is Apr 1–Apr 10
  // - Weeks after that are Mon–Fri windows
  const year = baseDate.getFullYear();
  const week1Start = new Date(year, 3, 1, 0, 0, 0, 0);
  const week1End = new Date(year, 3, 10, 23, 59, 59, 999);

  // Month is calendar month offset from April.
  const month = (d.getFullYear() - baseDate.getFullYear()) * 12 + (d.getMonth() - baseDate.getMonth()) + 1;

  if (d <= week1End) {
    return { month: Math.max(1, month), week: 1, termIndex: 0 };
  }

  // Find the Monday after week1End.
  const week2Start = new Date(week1End);
  week2Start.setHours(0, 0, 0, 0);
  week2Start.setDate(week2Start.getDate() + 1);
  while (week2Start.getDay() !== 1) week2Start.setDate(week2Start.getDate() + 1); // 1 = Monday

  // Weekend should count as the previous business week for "this week" views.
  const effective = new Date(d);
  if (effective.getDay() === 6) effective.setDate(effective.getDate() - 1); // Sat -> Fri
  if (effective.getDay() === 0) effective.setDate(effective.getDate() - 2); // Sun -> Fri
  effective.setHours(0, 0, 0, 0);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // Week index within the tracking program:
  const daysSinceWeek2 = Math.max(0, Math.floor((effective.getTime() - week2Start.getTime()) / MS_PER_DAY));
  const weeksSinceWeek2 = Math.floor(daysSinceWeek2 / 7);
  const programWeek = 2 + weeksSinceWeek2;

  // Week number within the current calendar month:
  // - For April (month=1): Week 1 is the special kickoff window, then increments.
  // - For later months: Week 1 starts on the first Monday of the month (Mon–Fri windows).
  let week = 1;
  if (month === 1) {
    week = programWeek;
  } else {
    const monthStart = new Date(effective.getFullYear(), effective.getMonth(), 1, 0, 0, 0, 0);
    // First Monday in this month:
    const firstMon = new Date(monthStart);
    while (firstMon.getDay() !== 1) firstMon.setDate(firstMon.getDate() + 1);
    const daysSinceFirstMon = Math.max(0, Math.floor((effective.getTime() - firstMon.getTime()) / MS_PER_DAY));
    week = 1 + Math.floor(daysSinceFirstMon / 7);
  }

  return { month: Math.max(1, month), week, termIndex: programWeek };
}

function getCycleMonthLabel(cycleMonth, baseDate = getCycleBaseDate()) {
  const monthDate = new Date(baseDate);
  monthDate.setMonth(baseDate.getMonth() + Math.max(0, Number(cycleMonth ?? 1) - 1));
  return monthDate.toLocaleString(undefined, { month: "long" });
}

function fmtDateTime(value) {
  if (!value) return "—";
  const d =
    typeof value === "number"
      ? new Date(value > 2_000_000_000 ? value : value * 1000)
      : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { hour12: true });
}

function pill(text, tone = "slate") {
  const tones = {
    slate: "bg-slate-800 text-slate-100",
    red: "bg-red-950/60 text-red-200 ring-1 ring-red-900",
    amber: "bg-amber-950/60 text-amber-200 ring-1 ring-amber-900",
    green: "bg-emerald-950/60 text-emerald-200 ring-1 ring-emerald-900"
  };
  return el("span", { class: `inline-flex items-center px-2 py-0.5 rounded-md text-[11px] ${tones[tone] ?? tones.slate}` }, [
    text
  ]);
}

function btn(label, active, onClick) {
  const node = el(
    "button",
    {
      class: `px-3 py-2 rounded text-sm ring-1 ${
        active ? "bg-slate-800 ring-slate-600 text-slate-50" : "bg-slate-950/40 ring-slate-800 text-slate-200 hover:bg-slate-900"
      }`
    },
    [label]
  );
  node.addEventListener("click", onClick);
  return node;
}

async function apiGet(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return await res.json();
}

function resolvePeriods(summary) {
  // Backwards/forwards compatible with buildSummary output.
  const root = summary?.periods && typeof summary.periods === "object" ? summary.periods : summary;
  return {
    today: root?.today ?? null,
    yesterday: root?.yesterday ?? null,
    week: root?.week ?? null,
    month: root?.month ?? null
  };
}

function buildGalleryModal() {
  const overlay = el("div", { class: "fixed inset-0 bg-black/70 hidden z-[80]" });
  const panel = el("div", { class: "absolute inset-0 flex items-center justify-center p-2 sm:p-6" });
  const box = el("div", { class: "w-full max-w-6xl max-h-[96vh] sm:max-h-[90vh] flex flex-col bg-slate-950 ring-1 ring-slate-800 rounded-xl overflow-hidden" });

  const header = el("div", { class: "flex items-center justify-between px-4 py-3 border-b border-slate-800" }, [
    el("div", { class: "text-sm text-slate-100 font-semibold truncate", id: "galleryTitle" }, ["Photos"]),
    el("button", { class: "text-xs px-3 py-1 rounded bg-slate-800 hover:bg-slate-700" }, ["Close"])
  ]);
  header.lastChild.addEventListener("click", () => close());

  const body = el("div", { class: "grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0 flex-1 overflow-hidden" });
  const main = el("div", { class: "p-3 sm:p-4 overflow-auto" });
  const img = el("img", { class: "w-full max-h-[44vh] sm:max-h-[50vh] object-contain bg-black/30 rounded-lg", alt: "" });
  const status = el("div", { class: "text-xs text-slate-400 mt-2", id: "galleryStatus" }, [""]);

  const nav = el("div", { class: "flex items-center justify-between mt-3" }, [
    el("button", { class: "text-xs px-3 py-2 rounded bg-slate-800 hover:bg-slate-700" }, ["Prev"]),
    el("div", { class: "text-xs text-slate-300 font-mono", id: "galleryCounter" }, ["0 / 0"]),
    el("button", { class: "text-xs px-3 py-2 rounded bg-slate-800 hover:bg-slate-700" }, ["Next"])
  ]);

  const side = el("div", { class: "p-3 sm:p-4 border-t lg:border-t-0 lg:border-l border-slate-800 overflow-auto" });
  const thumbs = el("div", { class: "grid grid-cols-4 lg:grid-cols-3 gap-2", id: "galleryThumbs" });
  side.append(el("div", { class: "text-xs text-slate-400 mb-2" }, ["Scroll to browse, click to open."]), thumbs);

  main.append(img, nav, status);
  body.append(main, side);
  box.append(header, body);
  panel.append(box);
  overlay.append(panel);
  document.body.append(overlay);

  let urls = [];
  let idx = 0;
  let failed = new Set();

  function cleanPhotoUrls(photoUrls) {
    if (!Array.isArray(photoUrls)) return [];
    const out = [];
    for (const raw of photoUrls) {
      if (typeof raw !== "string") continue;
      const u = raw.trim();
      if (!u || !u.startsWith("http")) continue;
      out.push(u);
    }
    return Array.from(new Set(out));
  }

  function render() {
    const url = urls[idx] ?? "";
    const statusEl = box.querySelector("#galleryStatus");
    if (statusEl) statusEl.textContent = "";
    img.src = url;
    img.alt = "";
    const counter = box.querySelector("#galleryCounter");
    if (counter) counter.textContent = `${urls.length ? idx + 1 : 0} / ${urls.length}`;
    const thumbsEl = box.querySelector("#galleryThumbs");
    if (thumbsEl) {
      thumbsEl.innerHTML = "";
      thumbsEl.append(
        ...urls.slice(0, 80).map((u, i) => {
          const t = el("img", {
            class:
              "w-full aspect-square object-cover rounded-md ring-1 cursor-pointer " +
              (i === idx ? "ring-slate-400" : "ring-slate-800 hover:ring-slate-500"),
            src: u,
            alt: ""
          });
          t.addEventListener("error", () => {
            t.className = "w-full aspect-square object-cover rounded-md ring-1 ring-slate-900 opacity-40";
          });
          t.addEventListener("click", () => {
            idx = i;
            render();
          });
          return t;
        })
      );
    }
  }

  function open({ modalTitle, photoUrls, startIndex = 0 }) {
    urls = cleanPhotoUrls(photoUrls);
    failed = new Set();
    idx = Math.max(0, Math.min(startIndex, Math.max(0, urls.length - 1)));
    const title = box.querySelector("#galleryTitle");
    if (title) title.textContent = modalTitle || "Photos";
    overlay.classList.remove("hidden");
    const statusEl = box.querySelector("#galleryStatus");
    if (statusEl && urls.length === 0) statusEl.textContent = "No valid photos available for this submission.";
    render();
  }

  function close() {
    overlay.classList.add("hidden");
  }

  nav.firstChild.addEventListener("click", () => {
    idx = (idx - 1 + urls.length) % (urls.length || 1);
    render();
  });
  nav.lastChild.addEventListener("click", () => {
    idx = (idx + 1) % (urls.length || 1);
    render();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  img.addEventListener("error", () => {
    failed.add(idx);
    const next = urls.findIndex((_u, i) => !failed.has(i));
    const statusEl = box.querySelector("#galleryStatus");
    if (next >= 0) {
      idx = next;
      if (statusEl) statusEl.textContent = "One photo failed to load; showing next available.";
      render();
      return;
    }
    img.removeAttribute("src");
    if (statusEl) statusEl.textContent = "Unable to load photos for this item.";
  });

  return { open, close };
}

const gallery = buildGalleryModal();

function buildDetailDrawer() {
  const overlay = el("div", { class: "fixed inset-0 bg-black/60 hidden z-40" });
  const panel = el("aside", {
    class:
      "fixed top-0 right-0 h-full w-full sm:w-[520px] bg-slate-950 ring-1 ring-slate-800 shadow-2xl translate-x-full transition-transform z-50 flex flex-col"
  });

  const header = el("div", { class: "px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3" }, [
    el("div", { class: "min-w-0" }, [
      el("div", { class: "text-sm font-semibold text-slate-100 truncate", id: "drawerTitle" }, ["Site"]),
      el("div", { class: "text-xs text-slate-400 truncate", id: "drawerSubtitle" }, ["—"])
    ]),
    el("button", { class: "text-xs px-3 py-1 rounded bg-slate-800 hover:bg-slate-700" }, ["Close"])
  ]);
  header.lastChild.addEventListener("click", () => hide());

  const body = el("div", { class: "p-4 overflow-auto space-y-4" });

  panel.append(header, body);
  document.body.append(overlay, panel);

  overlay.addEventListener("click", () => hide());

  function show() {
    overlay.classList.remove("hidden");
    panel.classList.remove("translate-x-full");
  }
  function hide() {
    overlay.classList.add("hidden");
    panel.classList.add("translate-x-full");
  }

  async function openSite(site) {
    show();
    const title = panel.querySelector("#drawerTitle");
    const sub = panel.querySelector("#drawerSubtitle");
    if (title) title.textContent = site || "Site";
    if (sub) sub.textContent = "Loading…";
    body.innerHTML = "";
    body.append(card("Loading", [el("div", { class: "text-xs text-slate-300" }, ["Fetching latest details…"])]));

    try {
      const details = await apiGet(`/api/site-details?site=${encodeURIComponent(site)}`);
      const latest = details.latest ?? null;
      const created = latest?.created ? fmtDateTime(latest.created) : "—";
      if (sub) sub.textContent = `${created} • ${latest?.vendor ?? "—"} • ${latest?.formName ?? "—"}`;

      body.innerHTML = "";

      body.append(
        card("Latest Submission", [
          kvRow("When", created),
          kvRow("Vendor", latest?.vendor ?? "—"),
          kvRow("Form", latest?.formName ?? "—"),
          kvRow("Submission", latest?.submissionId ?? "—"),
          latest?.notes?.length ? kvRow("Notes", Array.isArray(latest.notes) ? latest.notes.join(" • ") : latest.notes) : el("div", {})
        ])
      );

      const photos = Array.isArray(details.photos) ? details.photos : [];
      body.append(
        card("Photos", [
          el("div", { class: "text-xs text-slate-400 mb-2" }, ["Click any photo to open the full gallery."]),
          photos.length
            ? el(
                "div",
                { class: "grid grid-cols-3 sm:grid-cols-4 gap-2" },
                photos.slice(0, 16).map((u, idx) => {
                  const img = el("img", {
                    class:
                      "w-full aspect-square object-cover rounded-md ring-1 ring-slate-800 cursor-pointer hover:ring-slate-500",
                    src: u,
                    alt: ""
                  });
                  img.addEventListener("click", () => gallery.open({ modalTitle: `${site} photos`, photoUrls: photos, startIndex: idx }));
                  return img;
                })
              )
            : el("div", { class: "text-xs text-slate-400" }, ["No photos found in snapshot."])
        ])
      );

      body.append(
        card("History", [
          el(
            "div",
            { class: "space-y-2" },
            (details.submissions ?? []).slice(0, 25).map((s) =>
              el("button", { class: "w-full text-left rounded-lg bg-slate-950/40 ring-1 ring-slate-800 p-3 hover:ring-slate-500" }, [
                el("div", { class: "flex items-start justify-between gap-2" }, [
                  el("div", { class: "min-w-0" }, [
                    el("div", { class: "text-xs text-slate-100 font-semibold truncate" }, [s.formName ?? "Form"]),
                    el("div", { class: "text-[11px] text-slate-400 truncate" }, [
                      `${s.created ? fmtDateTime(s.created) : "—"} • ${s.vendor ?? "—"} • ${s.submissionId ?? "—"}`
                    ])
                  ]),
                  s.suspect ? pill("Review", "amber") : pill("Submitted", "slate")
                ]),
                s.notes?.length ? el("div", { class: "text-[11px] text-slate-500 mt-1 line-clamp-2" }, [Array.isArray(s.notes) ? s.notes.join(" • ") : s.notes]) : el("span")
              ])
            )
          )
        ])
      );
    } catch (err) {
      body.innerHTML = "";
      body.append(card("Error", [el("div", { class: "text-xs text-red-200" }, [String(err?.message ?? err)])]));
    }
  }

  return { openSite, hide };
}

const drawer = buildDetailDrawer();

function pickPeriod(periods, key) {
  return periods?.[key] ?? null;
}

function renderPeriodButtons(activeKey) {
  if (!periodBtns) return;
  periodBtns.classList.remove("hidden");
  periodBtns.innerHTML = "";
  periodBtns.append(
    ...PERIODS.map((p) =>
      btn(p.label, p.key === activeKey, () => {
        localStorage.setItem("sf_period", p.key);
        setActivePeriod(p.key);
      })
    )
  );
}

let lastSummary = null;
let siteMetaByName = new Map();
let activePeriod = localStorage.getItem("sf_period") || "today";
let activeRegion = localStorage.getItem("sf_region") || null;
let activeFormFilter = localStorage.getItem("sf_form") || null;
let activePghBrand = localStorage.getItem("sf_pgh_brand") || null;
let needsSearch = localStorage.getItem("sf_search_needs") || "";
let timelineSearch = localStorage.getItem("sf_search_timeline") || "";
let contactsSearch = localStorage.getItem("sf_search_contacts") || "";
let selectedWeekDay = null;
let searchFocusField = null;
let searchCursor = null;

function setActivePeriod(key) {
  activePeriod = key;
  render();
}

function setActiveRegion(key) {
  activeRegion = key;
  if (key) localStorage.setItem("sf_region", key);
  else localStorage.removeItem("sf_region");
  if (key !== "pittsburgh") {
    activePghBrand = null;
    localStorage.removeItem("sf_pgh_brand");
  }
  render();
}

function setActivePghBrand(brand) {
  activePghBrand = brand || null;
  if (activePghBrand) localStorage.setItem("sf_pgh_brand", activePghBrand);
  else localStorage.removeItem("sf_pgh_brand");
  render();
}

function setActiveFormFilter(formName) {
  activeFormFilter = formName || null;
  if (activeFormFilter) localStorage.setItem("sf_form", activeFormFilter);
  else localStorage.removeItem("sf_form");
  render();
}

function renderRegionButtons() {
  const container = document.getElementById("regionBtns");
  if (!container) return;
  container.innerHTML = "";
  const allBtn = btn("All Areas", !activeRegion, () => setActiveRegion(null));
  container.append(allBtn);
  container.append(
    ...REGIONS.map((r) =>
      btn(r.label, r.key === activeRegion, () => setActiveRegion(r.key))
    )
  );
  if (activeRegion === "pittsburgh") {
    container.append(
      el("span", { class: "text-xs text-slate-500 ml-2" }, ["Brand:"]),
      btn("All", !activePghBrand, () => setActivePghBrand(null)),
      btn("KeyBank", activePghBrand === "keybank", () => setActivePghBrand("keybank")),
      btn("GetGo", activePghBrand === "getgo", () => setActivePghBrand("getgo"))
    );
  }
}

function renderWeeklyProgress(periods, summary) {
  const now = new Date();
  const cycleBase = getCycleBaseDate(now);
  const cycleNow = getCycleMonthWeek(Math.floor(now.getTime() / 1000), cycleBase);
  const cycleMonthLabel = getCycleMonthLabel(cycleNow.month, cycleBase);
  const monthItems = (Array.isArray(periods?.month?.timeline) ? periods.month.timeline : [])
    .filter((it) => matchesScope(it?.site, activeRegion, activePghBrand))
    .filter((it) => isRegularlyScheduledForm(it?.formName));

  const weekItems = monthItems.filter((it) => {
    const c = getCycleMonthWeek(it?.created, cycleBase);
    return c.month === cycleNow.month && c.week === cycleNow.week;
  });

  let targetSites = new Set(monthItems.map((it) => String(it?.site ?? "")).filter(Boolean));
  const catalogSites = summary?.siteCatalog?.regularlyScheduledSiteNames;
  if (Array.isArray(catalogSites) && catalogSites.length) {
    targetSites = new Set(
      catalogSites
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .filter((s) => matchesScope(s, activeRegion, activePghBrand))
    );
  }

  const termStart = new Date(cycleBase);
  termStart.setDate(cycleBase.getDate() + cycleNow.termIndex * 9);
  const dayKeys = [];
  for (let i = 0; i < 9; i++) {
    const d = new Date(termStart);
    d.setDate(termStart.getDate() + i);
    d.setHours(0, 0, 0, 0);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const byDay = new Map(dayKeys.map((k) => [k, { key: k, submissions: 0, sites: new Set() }]));
  for (const it of weekItems) {
    const d = new Date(Number(it?.created ?? 0) * 1000);
    if (Number.isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    if (!byDay.has(key)) continue;
    const row = byDay.get(key);
    row.submissions += 1;
    if (it?.site) row.sites.add(String(it.site));
  }

  const totalDoneSites = new Set(weekItems.map((it) => String(it?.site ?? "")).filter(Boolean)).size;
  const targetCount = targetSites.size;
  const progressPct = targetCount ? Math.round((totalDoneSites / targetCount) * 100) : 0;
  const peak = Math.max(1, ...[...byDay.values()].map((v) => v.submissions));
  const selected = selectedWeekDay && byDay.has(selectedWeekDay) ? byDay.get(selectedWeekDay) : null;

  const bars = [...byDay.values()].map((v) => {
    const h = Math.max(8, Math.round((v.submissions / peak) * 120));
    const label = new Date(v.key + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
    const active = selected?.key === v.key;
    const bar = el("button", { class: "flex-1 min-w-[42px] sm:min-w-[72px] text-left" }, [
      el("div", { class: `w-full rounded-t-md transition-all ${active ? "bg-emerald-400" : "bg-slate-700 hover:bg-slate-500"}`, style: `height:${h}px` }),
      el("div", { class: `mt-1 text-[10px] ${active ? "text-emerald-300" : "text-slate-400"}` }, [label]),
      el("div", { class: "text-[10px] text-slate-500" }, [String(v.submissions)])
    ]);
    bar.addEventListener("click", () => {
      selectedWeekDay = selectedWeekDay === v.key ? null : v.key;
      render();
    });
    return bar;
  });

  return card(`Progress for ${cycleMonthLabel} Week ${cycleNow.week}`, [
    el("div", { class: "flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2" }, [
      el("div", { class: "text-xs text-slate-300" }, [`${totalDoneSites} out of ${targetCount || 0} branches serviced (regularly scheduled form)`]),
      pill(`${progressPct}% complete`, progressPct >= 85 ? "green" : progressPct >= 50 ? "amber" : "red")
    ]),
    el("div", { class: "h-2 rounded bg-slate-800 overflow-hidden mb-3" }, [
      el("div", { class: "h-full bg-emerald-500", style: `width:${Math.max(2, progressPct)}%` })
    ]),
    el("div", { class: "flex items-end gap-1 sm:gap-2 h-[140px] sm:h-[160px]" }, bars),
    selected
      ? el("div", { class: "text-xs text-slate-400 mt-3" }, [
          `${new Date(selected.key + "T00:00:00").toLocaleDateString()}: ${selected.submissions} submissions across ${selected.sites.size} sites`
        ])
      : el("div", { class: "text-xs text-slate-500 mt-3" }, ["Click a bar to inspect that day."])
  ]);
}

function renderNeedsServiced(periods) {
  const now = new Date();
  const cycleBase = getCycleBaseDate(now);
  const cycleNow = getCycleMonthWeek(Math.floor(now.getTime() / 1000), cycleBase);
  const cycleMonthLabel = getCycleMonthLabel(cycleNow.month, cycleBase);
  const monthItems = (Array.isArray(periods?.month?.timeline) ? periods.month.timeline : [])
    .filter((it) => matchesScope(it?.site, activeRegion, activePghBrand))
    .filter((it) => isRegularlyScheduledForm(it?.formName));

  const allRegularSites = new Set();
  const latestBySite = new Map();
  const servicedThisWeekSites = new Set();

  for (const it of monthItems) {
    const site = String(it?.site ?? "").trim();
    if (!site) continue;
    allRegularSites.add(site);

    const prev = latestBySite.get(site);
    if (!prev || Number(it?.created ?? 0) > Number(prev?.created ?? 0)) latestBySite.set(site, it);

    const c = getCycleMonthWeek(it?.created, cycleBase);
    if (c.month === cycleNow.month && c.week === cycleNow.week) servicedThisWeekSites.add(site);
  }

  // Prefer full site catalog when available so “needs serviced” includes sites with zero submissions in last 30 days.
  const catalogSites = lastSummary?.siteCatalog?.regularlyScheduledSiteNames;
  const usingCatalog = Array.isArray(catalogSites) && catalogSites.length;
  if (usingCatalog) {
    allRegularSites.clear();
    for (const raw of catalogSites) {
      const s = String(raw ?? "").trim();
      if (!s) continue;
      if (!matchesScope(s, activeRegion, activePghBrand)) continue;
      allRegularSites.add(s);
    }
  }

  const rows = [...allRegularSites]
    .filter((site) => !servicedThisWeekSites.has(site))
    .map((site) => {
      const it = latestBySite.get(site) ?? {};
      return {
        site,
        vendor: it?.vendor ?? "—",
        email: it?.email ?? "",
        lastServiced: it?.created ?? null,
        formName: it?.formName ?? "—"
      };
    })
    .filter((r) => {
      const q = needsSearch.trim().toLowerCase();
      if (!q) return true;
      return `${r.site} ${r.vendor} ${r.formName} ${r.email}`.toLowerCase().includes(q);
    })
    .sort((a, b) => (Number(a.lastServiced ?? 0) || 0) - (Number(b.lastServiced ?? 0) || 0));

  const needsInput = el("input", {
    class: "text-xs bg-slate-900 ring-1 ring-slate-700 rounded px-2 py-1 text-slate-200 w-full sm:w-60",
    placeholder: "Search site/vendor/form…",
    value: needsSearch,
    "aria-label": "Search needs serviced"
  });
  needsInput.addEventListener("input", (e) => {
    needsSearch = String(e.target?.value ?? "");
    localStorage.setItem("sf_search_needs", needsSearch);
    searchFocusField = "needs";
    searchCursor = e.target?.selectionStart ?? needsSearch.length;
    render();
  });

  if (searchFocusField === "needs") {
    requestAnimationFrame(() => {
      needsInput.focus();
      if (typeof searchCursor === "number") needsInput.setSelectionRange(searchCursor, searchCursor);
    });
  }

  return card(`Regularly Scheduled This Week (${cycleMonthLabel} Week ${cycleNow.week})`, [
    el("div", { class: "flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2" }, [
      el("div", { class: "text-xs text-slate-400" }, [
        `${rows.length} site${rows.length !== 1 ? "s" : ""} still need regularly scheduled service in ${cycleMonthLabel}, week ${cycleNow.week}.` +
          (usingCatalog ? "" : " (site catalog missing; showing only sites with recent submissions)")
      ]),
      needsInput
    ]),
    rows.length === 0
      ? el("div", { class: "text-xs text-emerald-300" }, ["All known sites have at least one submission this week."])
      : isMobileViewport()
        ? el("div", { class: "space-y-2" },
            rows.slice(0, 120).map((r) => {
              const row = el("button", { class: "w-full text-left rounded-lg bg-slate-950/40 ring-1 ring-slate-800 p-3" }, [
                el("div", { class: "text-xs text-slate-100 font-semibold truncate" }, [r.site]),
                el("div", { class: "text-[11px] text-slate-300 truncate mt-1" }, [r.vendor]),
                el("div", { class: "text-[11px] text-slate-400 mt-1" }, [
                  `${r.lastServiced ? fmtDateTime(r.lastServiced) : "—"} • ${r.formName}`
                ])
              ]);
              row.addEventListener("click", () => drawer.openSite(r.site));
              return row;
            })
          )
        : el("div", { class: "overflow-auto" }, [
          el("div", { class: "min-w-[760px] grid grid-cols-[1fr_180px_200px_180px] gap-2 text-[11px] text-slate-400 pb-2 border-b border-slate-800" },
            ["Site", "Vendor", "Last Serviced", "Last Form"].map((t) => el("div", { class: "px-2" }, [t]))
          ),
          el("div", { class: "divide-y divide-slate-800/60" },
            rows.slice(0, 200).map((r) => {
              const row = el("button", { class: "w-full text-left min-w-[760px] grid grid-cols-[1fr_180px_200px_180px] gap-2 items-center py-2 hover:bg-slate-950/40 rounded" }, [
                el("div", { class: "px-2 text-xs text-slate-100 font-semibold truncate" }, [r.site]),
                el("div", { class: "px-2 text-xs text-slate-300 truncate" }, [r.vendor]),
                el("div", { class: "px-2 text-[11px] text-slate-400 font-mono" }, [r.lastServiced ? fmtDateTime(r.lastServiced) : "—"]),
                el("div", { class: "px-2 text-[11px] text-slate-400 truncate" }, [r.formName])
              ]);
              row.addEventListener("click", () => drawer.openSite(r.site));
              return row;
            })
          )
        ])
  ]);
}

function renderContacts(period) {
  const items = Array.isArray(period?.timeline) ? period.timeline : [];
  const filtered = items.filter((it) => matchesScope(it?.site, activeRegion, activePghBrand));

  // Deduplicate by email, track sites and last seen
  const byEmail = new Map();
  for (const it of filtered) {
    const email = it.email ?? "";
    const key = email || (it.vendor ?? "unknown");
    if (!byEmail.has(key)) byEmail.set(key, { email, vendor: it.vendor ?? "—", sites: new Set(), configured: new Set(), latest: 0 });
    const entry = byEmail.get(key);
    if (it.site) entry.sites.add(it.site);
    for (const addr of Array.isArray(it?.configuredEmails) ? it.configuredEmails : []) {
      if (addr) entry.configured.add(String(addr));
    }
    if ((it.created ?? 0) > entry.latest) { entry.latest = it.created ?? 0; entry.vendor = it.vendor ?? entry.vendor; }
  }
  const contacts = [...byEmail.values()].sort((a, b) => b.latest - a.latest);

  const q = contactsSearch.trim().toLowerCase();
  const visibleContacts = contacts.filter((c) => {
    if (!q) return true;
    return `${c.email} ${c.vendor} ${[...c.sites].join(" ")} ${[...c.configured].join(" ")}`.toLowerCase().includes(q);
  });

  const contactsInput = el("input", {
    class: "text-xs bg-slate-900 ring-1 ring-slate-700 rounded px-2 py-1 text-slate-200 w-full sm:w-60",
    placeholder: "Search email/vendor/site…",
    value: contactsSearch,
    "aria-label": "Search vendor contacts"
  });
  contactsInput.addEventListener("input", (e) => {
    contactsSearch = String(e.target?.value ?? "");
    localStorage.setItem("sf_search_contacts", contactsSearch);
    searchFocusField = "contacts";
    searchCursor = e.target?.selectionStart ?? contactsSearch.length;
    render();
  });

  if (searchFocusField === "contacts") {
    requestAnimationFrame(() => {
      contactsInput.focus();
      if (typeof searchCursor === "number") contactsInput.setSelectionRange(searchCursor, searchCursor);
    });
  }

  return card("Vendor Contacts", [
    el("div", { class: "flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2" }, [
      el("div", { class: "text-xs text-slate-400" }, [
        `${visibleContacts.length} unique vendor${visibleContacts.length !== 1 ? "s" : ""} active in this period.`
      ]),
      contactsInput
    ]),
    visibleContacts.length === 0
      ? el("div", { class: "text-xs text-slate-400" }, ["No vendor data in this period."])
      : isMobileViewport()
        ? el("div", { class: "space-y-2" },
            visibleContacts.map((c) => {
              const emailLink = c.email
                ? el("a", { href: `mailto:${c.email}`, class: "text-xs text-blue-400 hover:text-blue-300 font-mono break-all" }, [c.email])
                : el("div", { class: "text-xs text-slate-400" }, [c.vendor]);
              return el("div", { class: "rounded-lg bg-slate-950/40 ring-1 ring-slate-800 p-3" }, [
                emailLink,
                el("div", { class: "text-[11px] text-slate-500 mt-1" }, [c.vendor]),
                c.configured.size
                  ? el("div", { class: "text-[11px] text-slate-400 mt-1 break-all" }, [[...c.configured].join(", ")])
                  : el("span"),
                el("div", { class: "text-[11px] text-slate-300 mt-1" }, [[...c.sites].slice(0, 4).join(", ") + (c.sites.size > 4 ? ` +${c.sites.size - 4} more` : "")]),
                el("div", { class: "text-[11px] text-slate-400 font-mono mt-1" }, [c.latest ? fmtDateTime(c.latest) : "—"])
              ]);
            })
          )
        : el("div", { class: "overflow-auto" }, [
          el("div", { class: "min-w-[580px] grid grid-cols-[220px_1fr_160px] gap-2 text-[11px] text-slate-400 pb-2 border-b border-slate-800" },
            ["Email", "Sites Serviced", "Last Active"].map((t) => el("div", { class: "px-2" }, [t]))
          ),
          el("div", { class: "divide-y divide-slate-800/60" },
            visibleContacts.map((c) => {
              const emailLink = c.email
                ? el("a", { href: `mailto:${c.email}`, class: "text-xs text-blue-400 hover:text-blue-300 font-mono truncate block" }, [c.email])
                : el("div", { class: "text-xs text-slate-500 truncate" }, [c.vendor]);
              return el("div", { class: "min-w-[580px] grid grid-cols-[220px_1fr_160px] gap-2 items-start py-2" }, [
                el("div", { class: "px-2 min-w-0" }, [
                  emailLink,
                  c.configured.size
                    ? el("div", { class: "text-[10px] text-slate-400 truncate mt-0.5" }, [[...c.configured].join(", ")])
                    : el("span"),
                  el("div", { class: "text-[10px] text-slate-500 truncate mt-0.5" }, [c.vendor])
                ]),
                el("div", { class: "px-2 text-[11px] text-slate-300" }, [[...c.sites].slice(0, 6).join(", ") + (c.sites.size > 6 ? ` +${c.sites.size - 6} more` : "")]),
                el("div", { class: "px-2 text-[11px] text-slate-400 font-mono" }, [c.latest ? fmtDateTime(c.latest) : "—"])
              ]);
            })
          )
        ])
  ]);
}

function renderTimeline(period) {
  const items = Array.isArray(period?.timeline) ? period.timeline : [];
  const regionFiltered = items
    .slice()
    .filter((it) => matchesScope(it?.site, activeRegion, activePghBrand))
    .sort((a, b) => (Number(b?.created ?? 0) || 0) - (Number(a?.created ?? 0) || 0));

  const formTypeByName = new Map(
    (Array.isArray(lastSummary?.formCatalog) ? lastSummary.formCatalog : [])
      .filter((f) => f && f.name)
      .map((f) => [String(f.name), f.type ? String(f.type) : null])
  );

  const formOptions = Array.from(new Set(regionFiltered.map((it) => String(it?.formName ?? "")).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const effectiveForm = activeFormFilter && formOptions.includes(activeFormFilter) ? activeFormFilter : null;
  const sorted = regionFiltered
    .filter((it) => !effectiveForm || String(it?.formName ?? "") === effectiveForm)
    .filter((it) => {
      const q2 = timelineSearch.trim().toLowerCase();
      if (!q2) return true;
      return `${it?.site ?? ""} ${it?.vendor ?? ""} ${it?.formName ?? ""} ${it?.email ?? ""}`.toLowerCase().includes(q2);
    })
    .slice(0, 250);

  const timelineInput = el("input", {
    class: "text-xs bg-slate-900 ring-1 ring-slate-700 rounded px-2 py-1 text-slate-200 w-full sm:w-56",
    placeholder: "Search table…",
    value: timelineSearch,
    "aria-label": "Search timeline"
  });
  timelineInput.addEventListener("input", (e) => {
    timelineSearch = String(e.target?.value ?? "");
    localStorage.setItem("sf_search_timeline", timelineSearch);
    searchFocusField = "timeline";
    searchCursor = e.target?.selectionStart ?? timelineSearch.length;
    render();
  });

  if (searchFocusField === "timeline") {
    requestAnimationFrame(() => {
      timelineInput.focus();
      if (typeof searchCursor === "number") timelineInput.setSelectionRange(searchCursor, searchCursor);
    });
  }

  const formSelect = el("select", {
    class: "text-xs bg-slate-900 ring-1 ring-slate-700 rounded px-2 py-1 text-slate-200",
    "aria-label": "Filter timeline by form"
  });
  formSelect.append(el("option", { value: "" }, ["All forms"]));
  formSelect.append(
    ...formOptions.map((name) => {
      const type = formTypeByName.get(name);
      const label = type ? `${name} (${type})` : name;
      return el("option", { value: name }, [label]);
    })
  );
  formSelect.value = effectiveForm ?? "";
  formSelect.addEventListener("change", (e) => setActiveFormFilter(String(e.target?.value ?? "")));

  const head = el("div", { class: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3" }, [
    el("div", { class: "text-sm font-semibold text-slate-100" }, ["Timeline (by site)"]),
    el("div", { class: "flex flex-wrap items-center gap-2" }, [
      timelineInput,
      el("div", { class: "text-xs text-slate-400" }, ["Form:"]),
      formSelect,
      el("div", { class: "text-xs text-slate-500" }, ["Click a row to drill in"])
    ])
  ]);

  const table = isMobileViewport()
    ? el("div", { class: "space-y-2" },
        sorted.map((it) => {
          const type = it?.formType || formTypeByName.get(String(it?.formName ?? ""));
          const row = el("button", { class: "w-full text-left rounded-lg bg-slate-950/40 ring-1 ring-slate-800 p-3" }, [
            el("div", { class: "flex items-start justify-between gap-2" }, [
              el("div", { class: "text-xs text-slate-100 font-semibold truncate" }, [it?.site ?? "—"]),
              it?.suspect ? pill("Review", "amber") : pill("Submitted", "slate")
            ]),
            el("div", { class: "text-[11px] text-slate-400 mt-1" }, [it?.created ? fmtDateTime(it.created) : "—"]),
            el("div", { class: "text-[11px] text-slate-300 mt-1 truncate" }, [it?.vendor ?? "—"]),
            el("div", { class: "text-[11px] text-slate-400 mt-1" }, [type ? `${it?.formName ?? "—"} (${type})` : (it?.formName ?? "—")])
          ]);
          row.addEventListener("click", () => drawer.openSite(String(it?.site ?? "")));
          return row;
        })
      )
    : el("div", { class: "overflow-auto" }, [
        el(
          "div",
          { class: "min-w-[860px] grid grid-cols-[220px_180px_1fr_220px_120px] gap-2 text-[11px] text-slate-400 pb-2 border-b border-slate-800" },
          ["When", "Site", "Vendor", "Form", "Status"].map((t) => el("div", { class: "px-2" }, [t]))
        ),
        el(
          "div",
          { class: "divide-y divide-slate-800/60" },
          sorted.map((it) => {
            const type = it?.formType || formTypeByName.get(String(it?.formName ?? ""));
            const row = el("button", { class: "w-full text-left min-w-[860px] grid grid-cols-[220px_180px_1fr_220px_120px] gap-2 items-center py-2 hover:bg-slate-950/40" }, [
              el("div", { class: "px-2 text-xs text-slate-200 font-mono" }, [it?.created ? fmtDateTime(it.created) : "—"]),
              el("div", { class: "px-2 text-xs text-slate-100 font-semibold truncate" }, [it?.site ?? "—"]),
              el("div", { class: "px-2 text-xs text-slate-200 truncate" }, [it?.vendor ?? "—"]),
              el("div", { class: "px-2 text-xs text-slate-300 truncate" }, [type ? `${it?.formName ?? "—"} (${type})` : (it?.formName ?? "—")]),
              el("div", { class: "px-2 flex justify-end" }, [it?.suspect ? pill("Review", "amber") : pill("Submitted", "slate")])
            ]);
            row.addEventListener("click", () => drawer.openSite(String(it?.site ?? "")));
            return row;
          })
        )
      ]);

  return card("Sites Serviced", [head, table]);
}

async function render() {
  grid.innerHTML = "";
  renderPeriodButtons(activePeriod);

  try {
    if (!lastSummary) {
      subtitle.textContent = "Loading snapshot summary…";
      const payload = await apiGet("/api/summary");
      lastSummary = payload?.summary ?? null;
    }

    siteMetaByName = new Map();
    const catalogSites = Array.isArray(lastSummary?.siteCatalog?.sites) ? lastSummary.siteCatalog.sites : [];
    for (const s of catalogSites) {
      const name = String(s?.name ?? "").trim();
      if (!name) continue;
      siteMetaByName.set(name, s);
    }

    const periods = resolvePeriods(lastSummary);
    const period = pickPeriod(periods, activePeriod) ?? pickPeriod(periods, "today") ?? {};

    const updatedAt = lastSummary?.updatedAt ?? lastSummary?.generatedAt ?? lastSummary?.snapshotCreatedAt ?? null;
    subtitle.textContent = updatedAt ? `Snapshot updated: ${fmtDateTime(updatedAt)}` : "Snapshot loaded.";

    renderRegionButtons();
    grid.append(renderWeeklyProgress(periods, lastSummary));
    if (["today", "yesterday", "week"].includes(activePeriod)) {
      grid.append(renderNeedsServiced(periods));
    }
    grid.append(renderTimeline(period));
    grid.append(renderContacts(period));
  } catch (err) {
    subtitle.textContent = "Error loading snapshot summary.";
    grid.append(
      card("Error", [
        el("div", { class: "text-xs text-red-200" }, [String(err?.message ?? err)]),
        el("div", { class: "text-xs text-slate-400 mt-2" }, ["If this is a fresh setup, run: `npm run update`"])
      ])
    );
  }
}

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  const orig = refreshBtn.textContent;
  refreshBtn.textContent = "Fetching…";
  try {
    const r = await fetch("/api/update", { method: "POST" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      console.error("Update failed", j);
    }
  } catch (e) {
    console.error("Update error", e);
  }
  refreshBtn.textContent = orig;
  refreshBtn.disabled = false;
  lastSummary = null;
  await render();
});

// First paint
render();
