import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function envLocalPath() {
  // This renders server-side; best-effort path hint for local dev.
  return resolve(process.cwd(), ".env.local");
}

export default function SetupPage() {
  const pathHint = envLocalPath();
  let hasEnvLocal = false;
  try {
    readFileSync(pathHint, "utf8");
    hasEnvLocal = true;
  } catch {
    hasEnvLocal = false;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Dashboard setup</h1>
      <p className="mt-3 text-sm text-neutral-600">
        Set <code className="rounded bg-neutral-100 px-1 py-0.5">DASHBOARD_PASSWORD</code> to enable login.
      </p>

      <div className="mt-6 rounded-xl border bg-white p-5">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            In <code className="rounded bg-neutral-100 px-1 py-0.5">dashboard</code>, run{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5">npm run init:local</code>
          </li>
          <li>
            Open <code className="rounded bg-neutral-100 px-1 py-0.5">{pathHint}</code> and set{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5">DASHBOARD_PASSWORD</code> to a long random string
          </li>
          <li>
            Run <code className="rounded bg-neutral-100 px-1 py-0.5">npm run db:push</code>
          </li>
          <li>
            Start: <code className="rounded bg-neutral-100 px-1 py-0.5">npm run dev</code>
          </li>
        </ol>
      </div>

      <p className="mt-4 text-xs text-neutral-500">
        Detected <code className="rounded bg-neutral-100 px-1 py-0.5">.env.local</code>: {hasEnvLocal ? "yes" : "no"}
      </p>
    </main>
  );
}

