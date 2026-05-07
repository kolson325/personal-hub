import Link from "next/link";
import { prisma } from "@/lib/db";
import { addTodo, markDone, reopen, removeTodo, togglePinned } from "./actions";

export default async function TodoPage() {
  const [open, done] = await Promise.all([
    prisma.todoItem.findMany({
      where: { status: "OPEN" },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.todoItem.findMany({
      where: { status: "DONE" },
      orderBy: [{ doneAt: "desc" }],
      take: 50,
    }),
  ]);

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Allsite TODOs</h1>
            <p className="text-xs text-neutral-500">Persistent tasks that stay until you mark them done.</p>
          </div>
          <Link className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50" href="/">
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Add task</h2>
          <form action={addTodo} className="mt-3 grid gap-2">
            <input
              name="title"
              placeholder="Task title (e.g., Call KeyBank contact about new sites)"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <textarea
              name="notes"
              placeholder="Notes (optional)"
              className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <button className="w-fit rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">Add</button>
          </form>
          <p className="mt-3 text-xs text-neutral-500">
            Gmail/message auto-triage will plug into this later (needs OAuth + a small companion/connector).
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Open</h2>
            <ul className="mt-3 space-y-2">
              {open.length === 0 ? (
                <li className="text-sm text-neutral-500">No open tasks.</li>
              ) : (
                open.map((t) => (
                  <li key={t.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        {t.notes ? <div className="mt-1 text-sm text-neutral-600">{t.notes}</div> : null}
                        <div className="mt-2 text-xs text-neutral-500">
                          {t.source ? `source: ${t.source}` : "source: —"} {t.pinned ? " • pinned" : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        <form action={togglePinned.bind(null, t.id)}>
                          <button className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50">
                            {t.pinned ? "Unpin" : "Pin"}
                          </button>
                        </form>
                        <form action={markDone.bind(null, t.id)}>
                          <button className="rounded-lg bg-black px-2 py-1 text-xs font-medium text-white">Done</button>
                        </form>
                        <form action={removeTodo.bind(null, t.id)}>
                          <button className="rounded-lg border px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h2 className="text-sm font-semibold">Done (latest 50)</h2>
            <ul className="mt-3 space-y-2">
              {done.length === 0 ? (
                <li className="text-sm text-neutral-500">Nothing done yet.</li>
              ) : (
                done.map((t) => (
                  <li key={t.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t.title}</div>
                        {t.notes ? <div className="mt-1 text-sm text-neutral-600">{t.notes}</div> : null}
                        <div className="mt-2 text-xs text-neutral-500">
                          done: {t.doneAt ? t.doneAt.toISOString().slice(0, 10) : "—"}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        <form action={reopen.bind(null, t.id)}>
                          <button className="rounded-lg border px-2 py-1 text-xs hover:bg-neutral-50">Reopen</button>
                        </form>
                        <form action={removeTodo.bind(null, t.id)}>
                          <button className="rounded-lg border px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
