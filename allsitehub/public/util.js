export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.append(child);
  return node;
}

export function card(title, bodyNodes) {
  return el("section", { class: "rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4" }, [
    el("h2", { class: "text-sm font-semibold text-slate-100 mb-3" }, [title]),
    ...bodyNodes
  ]);
}

export function kvRow(k, v) {
  return el("div", { class: "flex items-start justify-between gap-3 py-1" }, [
    el("div", { class: "text-xs text-slate-400" }, [k]),
    el("div", { class: "text-xs text-slate-200 font-mono text-right break-all" }, [String(v)])
  ]);
}

