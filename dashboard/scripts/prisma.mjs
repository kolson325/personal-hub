import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const envPath = resolve(root, ".env.local");
if (existsSync(envPath)) {
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
    process.env[key] = value;
  }
}

const prismaBin = resolve(root, "node_modules", ".bin", "prisma");
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma.mjs <prisma-args...>");
  process.exit(2);
}

const result = spawnSync(prismaBin, args, {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);

