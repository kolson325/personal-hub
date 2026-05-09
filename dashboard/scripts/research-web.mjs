#!/usr/bin/env node

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error("Usage: node scripts/research-web.mjs <search query>");
  process.exit(2);
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanUrl(raw) {
  const decoded = decodeHtml(raw);
  try {
    const url = new URL(decoded, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : decoded;
  } catch {
    return decoded;
  }
}

const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
const res = await fetch(url, {
  headers: {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
    accept: "text/html,application/xhtml+xml",
  },
});

if (!res.ok) {
  console.error(`Search failed: HTTP ${res.status}`);
  process.exit(1);
}

const html = await res.text();
const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis)];
const results = matches.slice(0, 10).map((match) => ({
  title: decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()),
  url: cleanUrl(match[1]),
}));

console.log(JSON.stringify({ query, results }, null, 2));
