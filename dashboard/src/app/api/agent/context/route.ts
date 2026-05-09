import { NextResponse } from "next/server";
import { getAgentMemoryMarkdown } from "@/lib/agent-memory";
import { requireAgentToken } from "../_auth";

export async function GET(request: Request) {
  const auth = requireAgentToken(request);
  if (auth) return auth;

  const url = new URL(request.url);
  const agentType = String(url.searchParams.get("agentType") ?? "").trim();
  if (!agentType) {
    return NextResponse.json({ ok: false, error: "Missing agentType" }, { status: 400 });
  }

  const memoryMarkdown = await getAgentMemoryMarkdown(agentType);
  return NextResponse.json({ ok: true, agentType, memoryMarkdown });
}
