import Link from "next/link";

export function TopNav({
  title = "Kolson’s Dashboard",
  subtitle,
  right,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/60">{subtitle}</div> : null}
        </div>

        <nav className="no-scrollbar -mx-1 flex max-w-full items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:justify-end sm:pb-0">
          <NavLink href="/">Home</NavLink>
          <NavLink href="/automations">Automations</NavLink>
          <NavLink href="/inbox">Inbox</NavLink>
          <NavLink href="/todo">Tasks</NavLink>
          <NavLink href="/budget">Budget</NavLink>
          <NavLink href="/codex">Codex</NavLink>
          <NavLink href="/ai">Jobs</NavLink>
          <NavLink href="/deploy">Deploy</NavLink>
          {right}
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="min-h-10 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
  );
}
