import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function sseFormat(data: unknown, event?: string) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  return event ? `event: ${event}\n${payload}` : payload;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("jobId") ?? "").trim();
  if (!jobId) {
    return new Response("Missing jobId", { status: 400 });
  }

  const startedAt = Date.now();

  let lastText = "";
  let lastStatus = "";
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();

      async function tick() {
        if (closed) return;
        try {
          const j = await prisma.agentJob.findUnique({
            where: { id: jobId },
            select: {
              id: true,
              kind: true,
              runner: true,
              status: true,
              resultText: true,
              errorText: true,
              createdAt: true,
              claimedAt: true,
              finishedAt: true,
            },
          });

          if (!j || j.kind !== "codex" || j.runner !== "LOCAL") {
            controller.enqueue(enc.encode(sseFormat({ ok: false, error: "Not found" }, "error")));
            controller.close();
            closed = true;
            return;
          }

          const text = j.resultText ?? "";
          const status = j.status;
          if (text !== lastText || status !== lastStatus) {
            lastText = text;
            lastStatus = status;
            controller.enqueue(
              enc.encode(
                sseFormat({
                  ok: true,
                  job: {
                    id: j.id,
                    status: j.status,
                    createdAt: j.createdAt,
                    claimedAt: j.claimedAt,
                    finishedAt: j.finishedAt,
                    resultText: j.resultText,
                    errorText: j.errorText,
                  },
                })
              )
            );
          } else {
            // keepalive comment
            controller.enqueue(enc.encode(`: keepalive\n\n`));
          }

          if (status === "SUCCEEDED" || status === "FAILED" || status === "CANCELED") {
            controller.close();
            closed = true;
            return;
          }

          if (Date.now() - startedAt > 10 * 60 * 1000) {
            controller.enqueue(enc.encode(sseFormat({ ok: false, error: "Stream timeout" }, "error")));
            controller.close();
            closed = true;
          }
        } catch (e) {
          controller.enqueue(enc.encode(sseFormat({ ok: false, error: String(e) }, "error")));
        }
      }

      // initial tick immediately
      await tick();
      const interval = setInterval(() => void tick(), 800);

      // Close if the client disconnects.
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        if (!closed) controller.close();
        closed = true;
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

