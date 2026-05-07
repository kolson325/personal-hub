"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function runBizDevAgent(formData: FormData) {
  const notes = String(formData.get("notes") ?? "").trim();
  const run = await prisma.agentRun.create({
    data: { agentType: "bizdev", status: "running", inputJson: JSON.stringify({ notes }) },
  });

  // Placeholder output for MVP; replace with real research pipeline later.
  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: "succeeded",
      finishedAt: new Date(),
      outputMarkdown:
        `## BizDev Agent (MVP placeholder)\n\n` +
        `Notes: ${notes || "—"}\n\n` +
        `Next steps to make this real:\n` +
        `- Add a web-search provider (SerpAPI/Brave/Bing) or curated target list.\n` +
        `- Add an LLM summarizer (OpenAI API) and store leads + contact paths.\n` +
        `- Add a “draft outreach” generator (email/call scripts) with your tone + proof points.\n`,
    },
  });

  revalidatePath("/agents/bizdev");
}

