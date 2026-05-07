export type Devotional = {
  reference: string;
  text: string;
  takeaway: string;
  source?: "fallback" | "thebibleapi";
};

// Lightweight, offline-safe fallback list (short quotes).
// If you want a specific translation/provider, we can wire it via an API and cache it.
const FALLBACKS: Devotional[] = [
  {
    reference: "Proverbs 3:5–6",
    text: "Trust in the LORD with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths.",
    takeaway: "Pick one decision you’re overthinking today; pray, choose the next right step, and move.",
  },
  {
    reference: "Matthew 6:34",
    text: "Therefore do not be anxious about tomorrow, for tomorrow will be anxious for itself. Sufficient for the day is its own trouble.",
    takeaway: "Do the one thing that actually matters today; park tomorrow’s worries.",
  },
  {
    reference: "Colossians 3:23",
    text: "Whatever you do, work heartily, as for the Lord and not for men.",
    takeaway: "Show up with excellence on the smallest task; consistency compounds.",
  },
  {
    reference: "James 1:5",
    text: "If any of you lacks wisdom, let him ask God, who gives generously to all without reproach, and it will be given him.",
    takeaway: "Ask for wisdom specifically (not vaguely), then write down the clearest next action.",
  },
  {
    reference: "Philippians 4:6–7",
    text: "Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God.",
    takeaway: "Turn your biggest stress into a short prayer + one concrete action you can do in 10 minutes.",
  },
  {
    reference: "Micah 6:8",
    text: "What does the LORD require of you but to do justice, and to love kindness, and to walk humbly with your God?",
    takeaway: "Choose kindness once today in a real situation; it’s a power move.",
  },
  {
    reference: "Psalm 90:12",
    text: "So teach us to number our days that we may get a heart of wisdom.",
    takeaway: "Plan your day in blocks: focus, admin, relationships, rest.",
  },
];

function dayOfYear(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getFallbackDevotional(date = new Date()): Devotional {
  const idx = dayOfYear(date) % FALLBACKS.length;
  return { ...FALLBACKS[idx]!, source: "fallback" };
}

async function tryFetchTheBibleApi(): Promise<Devotional | null> {
  const url =
    process.env.DEVOTIONAL_THEBIBLEAPI_URL ??
    "https://thebibleapi.netlify.app/.netlify/functions/getVerse?translation=web&daily=true";
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json().catch(() => null)) as unknown;
  const obj = (json ?? {}) as Record<string, unknown>;
  const reference = String(obj.reference ?? obj.ref ?? "").trim();
  const text = String(obj.text ?? obj.verse ?? "").trim();
  if (!reference || !text) return null;
  return { reference, text, takeaway: "Pause, reflect, and apply one concrete action today.", source: "thebibleapi" };
}

export async function getDevotionalToday(date = new Date()): Promise<Devotional> {
  const provider = (process.env.DEVOTIONAL_PROVIDER ?? "fallback").toLowerCase();
  if (provider === "thebibleapi") {
    const got = await tryFetchTheBibleApi();
    if (got) return got;
  }
  return getFallbackDevotional(date);
}
