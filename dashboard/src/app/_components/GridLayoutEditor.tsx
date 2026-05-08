"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import type { GridItem, PanelId } from "@/app/layout/actions";

const ResponsiveGridLayout = WidthProvider(Responsive);

type Breakpoint = "lg" | "md" | "sm" | "xs" | "xxs";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalize(layout: Layout[], allowed: Set<string>): GridItem[] {
  const out: GridItem[] = [];
  for (const it of layout ?? []) {
    if (!it) continue;
    const i = String(it.i ?? "");
    if (!allowed.has(i)) continue;
    out.push({
      i: i as PanelId,
      x: Number(it.x ?? 0) || 0,
      y: Number(it.y ?? 0) || 0,
      w: clamp(Math.floor(Number(it.w ?? 6) || 6), 2, 12),
      h: clamp(Math.floor(Number(it.h ?? 4) || 4), 2, 40),
    });
  }
  return out;
}

function toMobileStack(layout: GridItem[]): Layout[] {
  const sorted = layout.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x) || a.i.localeCompare(b.i));
  let y = 0;
  return sorted.map((it) => {
    const out: Layout = { i: it.i, x: 0, y, w: 1, h: it.h };
    y += it.h;
    return out;
  });
}

function scaleLayout(layout: GridItem[], cols: number): Layout[] {
  if (cols <= 1) return toMobileStack(layout);
  const ratio = cols / 12;
  const out: Layout[] = [];
  for (const it of layout) {
    const w = clamp(Math.round(it.w * ratio), 1, cols);
    const x = clamp(Math.round(it.x * ratio), 0, Math.max(0, cols - w));
    out.push({ i: it.i, x, y: it.y, w, h: it.h });
  }
  return out;
}

export function GridLayoutEditor({
  edit,
  allowedIds,
  initialLayout,
  onSave,
  children,
}: {
  edit: boolean;
  allowedIds: PanelId[];
  initialLayout: GridItem[];
  onSave: (layout: GridItem[]) => Promise<void>;
  children: React.ReactNode;
}) {
  const allowed = useMemo(() => new Set<string>(allowedIds), [allowedIds]);
  const [layout, setLayout] = useState<GridItem[]>(() => initialLayout);
  const [isPending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("lg");
  const didInitRef = useRef(false);

  const colsByBp = useMemo(
    () => ({ lg: 12, md: 12, sm: 6, xs: 1, xxs: 1 }),
    [],
  );
  const canEdit = edit;

  const layouts: Layouts = useMemo(
    () => ({
      lg: layout as unknown as Layout[],
      md: scaleLayout(layout, colsByBp.md),
      sm: scaleLayout(layout, colsByBp.sm),
      xs: scaleLayout(layout, colsByBp.xs),
      xxs: scaleLayout(layout, colsByBp.xxs),
    }),
    [layout, colsByBp],
  );

  const childMap = useMemo(() => {
    const map = new Map<string, React.ReactNode>();
    const arr = React.Children.toArray(children);
    for (const el of arr) {
      if (!React.isValidElement(el)) continue;
      const rawKey = typeof el.key === "string" ? el.key : null;
      if (!rawKey) continue;
      const key = rawKey.replace(/^\.\$?/, "");
      map.set(key, el);
    }
    return map;
  }, [children]);

  return (
    <div>
      {edit ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-white/60">
            Drag to move, pull corners to resize.{" "}
            <span className={dirty ? "text-amber-200" : "text-emerald-200"}>
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!dirty || isPending}
              onClick={() =>
                startTransition(async () => {
                  await onSave(layout);
                  setDirty(false);
                })
              }
              className="rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-semibold text-black hover:bg-fuchsia-400 disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save layout"}
            </button>
          </div>
        </div>
      ) : null}

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={colsByBp}
        rowHeight={breakpoint === "xs" || breakpoint === "xxs" ? 40 : 34}
        margin={breakpoint === "xs" || breakpoint === "xxs" ? [10, 10] : [12, 12]}
        containerPadding={[0, 0]}
        isDraggable={canEdit}
        isResizable={canEdit}
        compactType="vertical"
        preventCollision={false}
        draggableHandle=".panel-drag"
        onBreakpointChange={(bp: string) => setBreakpoint((bp as Breakpoint) ?? "lg")}
        onLayoutChange={(current: Layout[], all: Layouts) => {
          if (!canEdit) return;
          if (!didInitRef.current) didInitRef.current = true;
          const normalized = normalize(all.lg ?? current, allowed);
          setLayout(normalized);
        }}
        onDragStop={() => {
          if (!canEdit || !didInitRef.current) return;
          setDirty(true);
        }}
        onResizeStop={() => {
          if (!canEdit || !didInitRef.current) return;
          setDirty(true);
        }}
      >
        {allowedIds.map((id) => (
          <div key={id} className="h-full">
            {childMap.get(id) ?? null}
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
