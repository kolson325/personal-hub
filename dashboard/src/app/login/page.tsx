import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = params.error === "1";
  const next = params.next ?? "/";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,.06)]">
        <h1 className="text-2xl font-semibold tracking-tight">Kolson’s Dashboard</h1>
        <p className="mt-2 text-sm text-white/70">Enter your dashboard password.</p>

        <form action={login} className="mt-6 grid gap-2">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium text-white/80">Password</label>
        <input
          name="password"
          type="password"
          autoFocus
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-fuchsia-500/50"
        />
        {error ? <p className="text-sm text-red-300">Wrong password.</p> : null}
        <button className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
          Sign in
        </button>
      </form>
      </div>
    </main>
  );
}
