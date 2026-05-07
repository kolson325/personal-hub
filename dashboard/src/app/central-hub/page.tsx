export default function CentralHubEmbedPage() {
  const src = process.env.ALLSITE_CENTRAL_HUB_URL ?? "https://allsitefacilities-centralhub.loca.lt";
  return (
    <main className="h-[100svh]">
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur">
          <div className="text-sm font-semibold">Central Hub (embedded)</div>
          <div className="text-xs text-white/60">Source: {src}</div>
        </div>
        <iframe
          className="h-full w-full flex-1"
          src={src}
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </main>
  );
}
