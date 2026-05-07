import { createHash, timingSafeEqual } from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

const COOKIE_NAME = "dash_auth";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function requiredPasswordConfigured() {
  return Boolean(process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_PASSWORD.trim().length > 0);
}

export function authCookieValue() {
  const password = process.env.DASHBOARD_PASSWORD ?? "";
  return sha256(password);
}

export function isAuthed(cookies: ReadonlyRequestCookies) {
  if (!requiredPasswordConfigured()) return false;
  const got = cookies.get(COOKIE_NAME)?.value ?? "";
  const expected = authCookieValue();
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function cookieName() {
  return COOKIE_NAME;
}

