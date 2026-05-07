import Link from "next/link";
import { prisma } from "@/lib/db";
import { addService, removeService } from "./actions";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const services = await prisma.service.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Services</h1>
            <p className="text-xs text-white/60">Links to each codebase/service you’re running.</p>
          </div>
          <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/">
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Add service</h2>
          <form action={addService} className="mt-3 grid gap-2">
            <input
              name="name"
              placeholder="Name (e.g., Central Hub, THE-COMBINE API, Dashboard)"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
            />
            <input
              name="url"
              placeholder="URL (optional, e.g., https://hub.yourdomain.com)"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
            />
            <textarea
              name="description"
              placeholder="Description (optional)"
              className="min-h-20 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
            />
            <button className="w-fit rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
              Add
            </button>
          </form>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Your services</h2>
          <ul className="mt-3 space-y-2">
            {services.length === 0 ? (
              <li className="text-sm text-white/60">No services yet.</li>
            ) : (
              services.map((s) => (
                <li key={s.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.name}</div>
                      {s.url ? (
                        <a className="mt-1 block truncate text-sm text-fuchsia-200 hover:underline" href={s.url}>
                          {s.url}
                        </a>
                      ) : null}
                      {s.description ? <div className="mt-1 text-sm text-white/70">{s.description}</div> : null}
                    </div>
                    <form action={removeService.bind(null, s.id)}>
                      <button className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10">
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
