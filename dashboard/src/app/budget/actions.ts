"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

function parseMoneyToCents(raw: string) {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export async function addBudgetEntry(formData: FormData) {
  const kind = String(formData.get("kind") ?? "expense").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const merchant = String(formData.get("merchant") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const cents = parseMoneyToCents(amountRaw);
  if (cents == null || cents <= 0) return;

  const signed = kind === "income" ? cents : -cents;
  await prisma.budgetEntry.create({
    data: {
      amountCents: signed,
      category: category || null,
      merchant: merchant || null,
      notes: notes || null,
    },
  });

  revalidatePath("/budget");
  revalidatePath("/");
}

export async function deleteBudgetEntry(id: string) {
  await prisma.budgetEntry.delete({ where: { id } }).catch(() => {});
  revalidatePath("/budget");
  revalidatePath("/");
}

