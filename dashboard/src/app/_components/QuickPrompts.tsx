"use client";

export function QuickPrompts({
  prompts,
  onPick,
}: {
  prompts: Array<{ label: string; text: string }>;
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p.text)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          title={p.text}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

