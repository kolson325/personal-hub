"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authCookieValue, cookieName, requiredPasswordConfigured } from "@/lib/auth";

export async function login(formData: FormData) {
  if (!requiredPasswordConfigured()) redirect("/setup");

  const password = String(formData.get("password") ?? "");
  if (password !== (process.env.DASHBOARD_PASSWORD ?? "")) {
    redirect("/login?error=1");
  }

  const jar = await cookies();
  jar.set(cookieName(), authCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(cookieName());
  redirect("/login");
}
