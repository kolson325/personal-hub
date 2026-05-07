export default function CentralHubEmbedPage() {
  return (
    <main className="h-[100svh] bg-neutral-50">
      <div className="flex h-full flex-col">
        <div className="border-b bg-white px-4 py-3">
          <div className="text-sm font-semibold">Central Hub (embedded)</div>
          <div className="text-xs text-neutral-500">Source: https://allsitefacilities-centralhub.loca.lt</div>
        </div>
        <iframe
          className="h-full w-full flex-1"
          src="https://allsitefacilities-centralhub.loca.lt"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </main>
  );
}

