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
    <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/60">{subtitle}</div> : null}
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          <NavLink href="/">Home</NavLink>
          <NavLink href="/automations">Automations</NavLink>
          <NavLink href="/inbox">Inbox</NavLink>
          <NavLink href="/todo">Tasks</NavLink>
          <NavLink href="/budget">Budget</NavLink>
          <NavLink href="/ai">AI</NavLink>
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
      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
    >
      {children}
    </Link>
  );
}
