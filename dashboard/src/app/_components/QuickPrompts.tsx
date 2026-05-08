"use client";

export function QuickPrompts({
  prompts,
  onPick,
  onRun,
}: {
  prompts: Array<{ label: string; text: string }>;
  onPick: (text: string) => void;
  onRun?: (text: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((p) => (
        <div key={p.label} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPick(p.text)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
            title={p.text}
          >
            {p.label}
          </button>
          {onRun ? (
            <button
              type="button"
              onClick={() => onRun(p.text)}
              className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/15 px-2 py-1.5 text-[11px] font-semibold text-fuchsia-100 hover:bg-fuchsia-500/25"
              title="Run now"
            >
              Run
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
