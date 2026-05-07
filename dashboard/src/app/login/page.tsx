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
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-600">Enter your dashboard password.</p>

      <form action={login} className="mt-6 space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium">Password</label>
        <input
          name="password"
          type="password"
          autoFocus
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
        />
        {error ? <p className="text-sm text-red-600">Wrong password.</p> : null}
        <button className="w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white">Sign in</button>
      </form>
    </main>
  );
}

