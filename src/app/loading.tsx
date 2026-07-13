export default function Loading() {
  return (
    <div className="min-h-dvh bg-background p-8" aria-label="화면 불러오는 중" role="status">
      <div className="mx-auto max-w-7xl animate-pulse space-y-6">
        <div className="h-8 w-56 rounded-lg bg-muted" />
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 rounded-xl border bg-card" />)}</div>
        <div className="h-96 rounded-xl border bg-card" />
      </div>
    </div>
  );
}
