import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  createScheduleFromTemplate,
  deleteSchedule,
  runScheduleNow,
  toggleScheduleEnabled,
  updateSchedule,
} from "./actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null) {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export default async function AutomationsPage() {
  const schedules = await prisma.automationSchedule.findMany({ orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }] });
  const templates = [
    { id: "allsite_update", name: "Allsite hub snapshot update" },
    { id: "bizdev_digest", name: "BizDev lead research digest" },
    { id: "devops_radar", name: "DevOps tech radar digest" },
    { id: "todo_triage", name: "Inbox/tasks triage (placeholder)" },
    { id: "services_ping", name: "Service health ping (placeholder)" },
    { id: "combine_scan", name: "THE-COMBINE scan (requires laptop companion)" },
  ];

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">Automations</h1>
            <p className="text-xs text-white/60">Configure which agents run on schedule (and run them now).</p>
          </div>
          <Link className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" href="/">
            Back
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Add automation</h2>
          <form action={createScheduleFromTemplate} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-white/70">Template</label>
            <select
              name="template"
              className="min-w-72 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
              defaultValue={templates[0]?.id ?? ""}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
              Add
            </button>
            <div className="w-full text-xs text-white/60">
              Note: schedules run inside the VPS worker container. Local-only tasks need your laptop companion (coming).
            </div>
          </form>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold">Your automations</h2>
          {schedules.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">No automations yet. Add one above.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {schedules.map((s) => (
                <div key={s.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-semibold">{s.name}</div>
                        <span
                          className={
                            "rounded-full border px-2 py-0.5 text-xs " +
                            (s.enabled
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-white/10 bg-white/5 text-white/60")
                          }
                        >
                          {s.enabled ? "Enabled" : "Disabled"}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/60">
                          {s.key}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        last run: {fmt(s.lastRunAt)} • next: {fmt(s.nextRunAt)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <form action={toggleScheduleEnabled.bind(null, s.id)}>
                        <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10">
                          {s.enabled ? "Disable" : "Enable"}
                        </button>
                      </form>
                      <form action={runScheduleNow.bind(null, s.id)}>
                        <button className="rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-semibold text-black hover:bg-fuchsia-400">
                          Run now
                        </button>
                      </form>
                      <form action={deleteSchedule.bind(null, s.id)}>
                        <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>

                  <form action={updateSchedule} className="mt-4 grid gap-2 md:grid-cols-12">
                    <input type="hidden" name="id" value={s.id} />

                    <div className="md:col-span-6">
                      <label className="text-xs font-medium text-white/70">Name</label>
                      <input
                        name="name"
                        defaultValue={s.name}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="text-xs font-medium text-white/70">Type</label>
                      <select
                        name="scheduleType"
                        defaultValue={s.scheduleType}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                      >
                        <option value="INTERVAL">Interval</option>
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="text-xs font-medium text-white/70">Interval (min)</label>
                      <input
                        name="intervalMinutes"
                        type="number"
                        min={1}
                        defaultValue={s.intervalMinutes ?? 60}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="text-xs font-medium text-white/70">Daily time (HH:MM)</label>
                      <input
                        name="timeOfDay"
                        defaultValue={s.timeOfDay ?? "09:00"}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                      />
                    </div>

                    <div className="md:col-span-6">
                      <label className="text-xs font-medium text-white/70">Weekly days (0=Sun..6=Sat)</label>
                      <input
                        name="daysOfWeek"
                        defaultValue={s.daysOfWeek ?? "1,2,3,4,5"}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                      />
                      <div className="mt-1 text-xs text-white/50">Example: 1,3,5 (Mon/Wed/Fri).</div>
                    </div>

                    <div className="md:col-span-3 md:flex md:items-end">
                      <button className="w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
