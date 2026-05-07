"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function queueRedeploy(target: string) {
  await prisma.agentJob.create({
    data: {
      kind: "redeploy",
      runner: "VPS",
      payloadJson: JSON.stringify({ target }),
      status: "QUEUED",
    },
  });
  revalidatePath("/deploy");
  revalidatePath("/");
}
