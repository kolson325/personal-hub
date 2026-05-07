import Link from "next/link";
import { prisma } from "@/lib/db";
import { addBudgetEntry, deleteBudgetEntry } from "./actions";
import { TopNav } from "@/app/_components/TopNav";
import { AskCodex } from "@/app/_components/AskCodex";
import { queueCodexTask } from "@/app/actions";

export const dynamic = "force-dynamic";

function dollars(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function startOfMonth(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function BudgetPage() {
  const monthStart = startOfMonth(new Date());
  const entries = await prisma.budgetEntry.findMany({ orderBy: { occurredOn: "desc" }, take: 50 });
  const monthEntries = await prisma.budgetEntry.findMany({
    where: { occurredOn: { gte: monthStart } },
    orderBy: { occurredOn: "desc" },
  });

  const income = monthEntries.filter((e) => e.amountCents > 0).reduce((a, e) => a + e.amountCents, 0);
  const expenses = monthEntries.filter((e) => e.amountCents < 0).reduce((a, e) => a + e.amountCents, 0);
  const net = income + expenses;

  const byCat = new Map<string, number>();
  for (const e of monthEntries) {
    if (e.amountCents >= 0) continue;
    const c = (e.category ?? "Uncategorized").trim() || "Uncategorized";
    byCat.set(c, (byCat.get(c) ?? 0) + e.amountCents);
  }
  const topCats = Array.from(byCat.entries())
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8);

  return (
    <main className="min-h-screen">
      <TopNav title="Budget" subtitle="Track income/expenses and get a daily digest." right={<Link className="hidden" href="/" />} />

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-semibold">Add entry</h2>
            <form action={addBudgetEntry} className="mt-3 grid gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-white/70">Type</label>
                  <select
                    name="kind"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                    defaultValue="expense"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-white/70">Amount</label>
                  <input
                    name="amount"
                    placeholder="e.g. 42.50"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-white/70">Category</label>
                  <input
                    name="category"
                    placeholder="e.g. Gas, Food, Bills"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/70">Merchant</label>
                  <input
                    name="merchant"
                    placeholder="e.g. Costco"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-white/70">Notes</label>
                <input
                  name="notes"
                  placeholder="optional"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                />
              </div>
              <button className="w-fit rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
                Add
              </button>
            </form>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-semibold">This month</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Stat label="Income" value={dollars(income)} />
              <Stat label="Expenses" value={dollars(expenses)} />
              <Stat label="Net" value={dollars(net)} />
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Top categories</div>
              <div className="mt-2 grid gap-2">
                {topCats.length === 0 ? (
                  <div className="text-sm text-white/60">No expenses yet.</div>
                ) : (
                  topCats.map(([cat, cents]) => (
                    <div key={cat} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="text-sm font-medium">{cat}</div>
                      <div className="text-sm text-white/70">{dollars(cents)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <AskCodex
              title="Ask Codex (budget)"
              placeholder="Examples: “Summarize my spending this month”, “Suggest a realistic weekly budget”, “Find my top 3 categories and what to cut.”"
              context="budget"
              action={queueCodexTask}
            />
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent entries</h2>
              <div className="text-xs text-white/60">latest 50</div>
            </div>
            <ul className="mt-3 space-y-2">
              {entries.length === 0 ? (
                <li className="text-sm text-white/60">No entries yet.</li>
              ) : (
                entries.map((e) => (
                  <li key={e.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold">{dollars(e.amountCents)}</div>
                          <div className="text-xs text-white/60">{e.occurredOn.toISOString().slice(0, 10)}</div>
                          {e.category ? <div className="text-xs text-white/60">• {e.category}</div> : null}
                          {e.merchant ? <div className="text-xs text-white/60">• {e.merchant}</div> : null}
                        </div>
                        {e.notes ? <div className="mt-1 text-sm text-white/70">{e.notes}</div> : null}
                      </div>
                      <form action={deleteBudgetEntry.bind(null, e.id)}>
                        <button className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10">
                          Delete
                        </button>
                      </form>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-semibold">Budget agent</h2>
            <p className="mt-2 text-sm text-white/70">
              Schedule a daily digest in <Link className="text-fuchsia-200 hover:underline" href="/automations">Automations</Link> →
              “Budget daily digest”.
            </p>
            <div className="mt-3 text-xs text-white/60">
              The digest is stored under Agent Runs (agentType: <code className="rounded bg-white/10 px-1 py-0.5">budget</code>).
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
