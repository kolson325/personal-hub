import Link from "next/link";
import { prisma } from "@/lib/db";
import { addService, removeService } from "./actions";

export default async function ServicesPage() {
  const services = await prisma.service.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <main className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Services</h1>
            <p className="text-xs text-neutral-500">Links to each codebase/service you’re running.</p>
          </div>
          <Link className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50" href="/">
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Add service</h2>
          <form action={addService} className="mt-3 grid gap-2">
            <input
              name="name"
              placeholder="Name (e.g., Central Hub, THE-COMBINE API, Dashboard)"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <input
              name="url"
              placeholder="URL (optional, e.g., https://hub.yourdomain.com)"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <textarea
              name="description"
              placeholder="Description (optional)"
              className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            />
            <button className="w-fit rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">Add</button>
          </form>
        </div>

        <div className="mt-4 rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold">Your services</h2>
          <ul className="mt-3 space-y-2">
            {services.length === 0 ? (
              <li className="text-sm text-neutral-500">No services yet.</li>
            ) : (
              services.map((s) => (
                <li key={s.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.name}</div>
                      {s.url ? (
                        <a className="mt-1 block truncate text-sm text-blue-700 hover:underline" href={s.url}>
                          {s.url}
                        </a>
                      ) : null}
                      {s.description ? <div className="mt-1 text-sm text-neutral-600">{s.description}</div> : null}
                    </div>
                    <form action={removeService.bind(null, s.id)}>
                      <button className="rounded-lg border px-2 py-1 text-xs text-red-700 hover:bg-red-50">Remove</button>
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
