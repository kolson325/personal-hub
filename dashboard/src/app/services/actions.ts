"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function addService(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  if (!name) return;

  await prisma.service.create({
    data: { name, description: description || null, url: url || null },
  });
  revalidatePath("/services");
  revalidatePath("/");
}

export async function removeService(id: string) {
  await prisma.service.delete({ where: { id } });
  revalidatePath("/services");
  revalidatePath("/");
}

