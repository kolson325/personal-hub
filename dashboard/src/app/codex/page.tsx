import { TopNav } from "@/app/_components/TopNav";
import { CodexChat } from "./CodexChat";
import { queueCodexTask } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function CodexPage() {
  return (
    <main className="min-h-screen">
      <TopNav title="Codex" subtitle="Chat-style LOCAL Codex runs (single in-flight run)." />
      <section className="mx-auto max-w-4xl px-6 py-6">
        <CodexChat action={queueCodexTask} initialState={{ ok: false, error: "" }} />
      </section>
    </main>
  );
}
