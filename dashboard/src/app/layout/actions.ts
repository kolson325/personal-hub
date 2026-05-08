"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export type PanelId =
  | "codex"
  | "devotional"
  | "budget"
  | "inbox"
  | "allsite"
  | "deploy";

const DEFAULT_ORDER: PanelId[] = [
  "codex",
  "devotional",
  "allsite",
  "budget",
  "inbox",
  "deploy",
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
