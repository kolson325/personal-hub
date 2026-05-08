"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export type PanelId =
  | "today"
  | "bizdev"
  | "devops"
  | "jobs"
  | "codex"
  | "devotional"
  | "budget"
  | "inbox"
  | "allsite"
  | "deploy";

export type GridItem = {
  i: PanelId;
  x: number;
  y: number;
  w: number;
  h: number;
};

const DEFAULT_ORDER: PanelId[] = [
  "today",
  "bizdev",
  "devops",
  "jobs",
  "codex",
  "devotional",
  "allsite",
  "budget",
  "inbox",
  "deploy",
];

const DEFAULT_LAYOUT: GridItem[] = [
  { i: "today", x: 0, y: 0, w: 6, h: 7 },
  { i: "codex", x: 6, y: 0, w: 6, h: 5 },
  { i: "devotional", x: 6, y: 5, w: 6, h: 2 },

  { i: "allsite", x: 0, y: 7, w: 12, h: 7 },

  { i: "bizdev", x: 0, y: 14, w: 6, h: 5 },
  { i: "devops", x: 6, y: 14, w: 6, h: 5 },

  { i: "budget", x: 0, y: 19, w: 6, h: 5 },
  { i: "inbox", x: 6, y: 19, w: 6, h: 5 },

  { i: "jobs", x: 0, y: 24, w: 6, h: 4 },
  { i: "deploy", x: 6, y: 24, w: 6, h: 4 },
];

export async function getPanelOrder(): Promise<PanelId[]> {
  const row = await prisma.panelLayout.findUnique({ where: { id: "default" } });
  if (!row?.orderJson) return DEFAULT_ORDER;
  try {
    const parsed = JSON.parse(row.orderJson);
    if (!Array.isArray(parsed)) return DEFAULT_ORDER;
    const allowed = new Set<string>(DEFAULT_ORDER);
    const safe = parsed.filter((x) => typeof x === "string" && allowed.has(x)) as PanelId[];
    const uniq: PanelId[] = [];
    for (const id of safe) if (!uniq.includes(id)) uniq.push(id);
    for (const id of DEFAULT_ORDER) if (!uniq.includes(id)) uniq.push(id);
    return uniq;
  } catch {
    return DEFAULT_ORDER;
  }
}

async function saveOrder(order: PanelId[]) {
  await prisma.panelLayout.upsert({
    where: { id: "default" },
    update: { orderJson: JSON.stringify(order) },
    create: { id: "default", orderJson: JSON.stringify(order) },
  });
}

export async function movePanel(panelId: PanelId, dir: "up" | "down") {
  const order = await getPanelOrder();
  const idx = order.indexOf(panelId);
  if (idx === -1) return;
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= order.length) return;
  const next = order.slice();
  const tmp = next[idx]!;
  next[idx] = next[swapWith]!;
  next[swapWith] = tmp;
  await saveOrder(next);
  revalidatePath("/");
}

export async function resetPanelLayout() {
  await saveOrder(DEFAULT_ORDER);
  revalidatePath("/");
}

export async function resetGridLayout() {
  await prisma.panelLayout.upsert({
    where: { id: "default" },
    update: { orderJson: JSON.stringify(DEFAULT_ORDER), layoutJson: JSON.stringify(DEFAULT_LAYOUT) },
    create: { id: "default", orderJson: JSON.stringify(DEFAULT_ORDER), layoutJson: JSON.stringify(DEFAULT_LAYOUT) },
  });
  revalidatePath("/");
}

export async function getGridLayout(): Promise<GridItem[]> {
  const row = await prisma.panelLayout.findUnique({ where: { id: "default" } });
  if (!row?.layoutJson) return DEFAULT_LAYOUT;
  try {
    const parsed = JSON.parse(row.layoutJson);
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT;
    const allowed = new Set<string>(DEFAULT_ORDER);
    const safe: GridItem[] = [];
    for (const x of parsed) {
      if (!x || typeof x !== "object") continue;
      const obj = x as Record<string, unknown>;
      const i = String(obj.i ?? "");
      if (!allowed.has(i)) continue;
      const item: GridItem = {
        i: i as PanelId,
        x: Number(obj.x ?? 0) || 0,
        y: Number(obj.y ?? 0) || 0,
        w: Math.max(2, Math.floor(Number(obj.w ?? 6) || 6)),
        h: Math.max(2, Math.floor(Number(obj.h ?? 4) || 4)),
      };
      safe.push(item);
    }
    const byId = new Map(safe.map((it) => [it.i, it]));
    for (const it of DEFAULT_LAYOUT) if (!byId.has(it.i)) safe.push(it);
    return safe;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export async function saveGridLayout(layout: GridItem[]) {
  const allowed = new Set<string>(DEFAULT_ORDER);
  const safe = layout.filter((it) => allowed.has(it.i));
  await prisma.panelLayout.upsert({
    where: { id: "default" },
    update: { layoutJson: JSON.stringify(safe) },
    create: { id: "default", orderJson: JSON.stringify(DEFAULT_ORDER), layoutJson: JSON.stringify(safe) },
  });
  revalidatePath("/");
}
