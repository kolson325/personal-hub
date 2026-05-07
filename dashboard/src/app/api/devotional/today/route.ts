import { NextResponse } from "next/server";
import { getDevotionalToday } from "@/lib/devotional";

export async function GET() {
  const devotional = await getDevotionalToday(new Date());
  return NextResponse.json({ ok: true, devotional });
}
