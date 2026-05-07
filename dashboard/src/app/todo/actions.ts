"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function addTodo(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!title) return;

  await prisma.todoItem.create({
    data: { title, notes: notes || null, source: "manual" },
  });
  revalidatePath("/todo");
  revalidatePath("/");
}

export async function togglePinned(id: string) {
  const item = await prisma.todoItem.findUnique({ where: { id } });
  if (!item) return;
  await prisma.todoItem.update({ where: { id }, data: { pinned: !item.pinned } });
  revalidatePath("/todo");
  revalidatePath("/");
}

export async function markDone(id: string) {
  await prisma.todoItem.update({
    where: { id },
    data: { status: "DONE", doneAt: new Date() },
  });
  revalidatePath("/todo");
  revalidatePath("/");
}

export async function reopen(id: string) {
  await prisma.todoItem.update({
    where: { id },
    data: { status: "OPEN", doneAt: null },
  });
  revalidatePath("/todo");
  revalidatePath("/");
}

export async function removeTodo(id: string) {
  await prisma.todoItem.delete({ where: { id } });
  revalidatePath("/todo");
  revalidatePath("/");
}

