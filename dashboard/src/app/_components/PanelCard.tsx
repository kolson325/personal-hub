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
    <div className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="panel-drag select-none text-sm font-semibold">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-white/60">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
