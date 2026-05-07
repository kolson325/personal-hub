import { NextResponse } from "next/server";

export function requireAgentToken(request: Request) {
  const expected = process.env.AGENT_TOKEN ?? "";
  if (!expected.trim()) {
    return NextResponse.json(
      { ok: false, error: "Server missing AGENT_TOKEN" },
      { status: 500 },
    );
  }

  const got = request.headers.get("x-agent-token") ?? "";
  if (got !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

