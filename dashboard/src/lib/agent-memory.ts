import { prisma } from "@/lib/db";

const MAX_MEMORY_CHARS = 24000;
const MAX_REPORT_CHARS = 16000;

function compact(value: string, max = MAX_MEMORY_CHARS) {
  const clean = value.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}\n\n[trimmed]`;
}

function extractHighlights(markdown: string) {
  const lines = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const picked: string[] = [];
  for (const line of lines) {
    if (picked.length >= 12) break;
    if (/^#{1,3}\s+/.test(line) || /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      picked.push(line.replace(/^#{1,3}\s+/, "").replace(/^[-*]\s+/, "- "));
    }
  }

  if (picked.length > 0) return picked.join("\n");
  return lines.slice(0, 8).join("\n");
}

async function upsertMemory(agentType: string, key: string, valueMarkdown: string, source?: { runId?: string; jobId?: string }) {
  await prisma.agentMemory.upsert({
    where: { agentType_key: { agentType, key } },
    update: {
      valueMarkdown: compact(valueMarkdown),
      sourceRunId: source?.runId ?? null,
      sourceJobId: source?.jobId ?? null,
    },
    create: {
      agentType,
      key,
      valueMarkdown: compact(valueMarkdown),
      sourceRunId: source?.runId ?? null,
      sourceJobId: source?.jobId ?? null,
    },
  });
}

export async function rememberAgentReport({
  agentType,
  runId,
  jobId,
  outputMarkdown,
}: {
  agentType: string;
  runId?: string;
  jobId?: string;
  outputMarkdown: string;
}) {
  const clean = compact(outputMarkdown, MAX_REPORT_CHARS);
  if (!agentType || !clean) return;

  const highlights = extractHighlights(clean);
  const previous = await prisma.agentMemory.findUnique({
    where: { agentType_key: { agentType, key: "running_context" } },
  });

  const stamp = new Date().toISOString();
  const nextContext = compact(
    [
      previous?.valueMarkdown ?? "",
      `\n\n## Report ${stamp}`,
      highlights,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  await Promise.all([
    upsertMemory(agentType, "latest_report", clean, { runId, jobId }),
    upsertMemory(agentType, "latest_highlights", highlights || clean.slice(0, 2000), { runId, jobId }),
    upsertMemory(agentType, "running_context", nextContext, { runId, jobId }),
  ]);
}

export async function getAgentMemory(agentType: string) {
  return prisma.agentMemory.findMany({
    where: { agentType },
    orderBy: [{ key: "asc" }],
  });
}

export async function getAgentMemoryMarkdown(agentType: string) {
  const memory = await getAgentMemory(agentType);
  if (memory.length === 0) return "";
  return memory
    .map((item) => `## ${item.key}\n${item.valueMarkdown}`)
    .join("\n\n")
    .slice(0, MAX_MEMORY_CHARS);
}
