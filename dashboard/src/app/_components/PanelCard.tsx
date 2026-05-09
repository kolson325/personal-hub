import type React from "react";

export function PanelCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="panel-drag select-none text-sm font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/60">{subtitle}</div> : null}
        </div>
        {right ? <div className="no-scrollbar flex max-w-full shrink-0 overflow-x-auto">{right}</div> : null}
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-visible sm:overflow-auto">{children}</div>
    </div>
  );
}
