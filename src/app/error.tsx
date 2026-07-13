"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center">
        <p className="font-mono text-xs text-destructive">ANALYSIS_INTERRUPTED</p>
        <h1 className="mt-3 text-2xl font-medium">분석을 완료하지 못했습니다</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">입력값 또는 데이터 연결 상태를 확인한 뒤 다시 시도해 주세요. 원본 데이터는 변경되지 않았습니다.</p>
        <button type="button" onClick={reset} className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">다시 시도</button>
      </div>
    </div>
  );
}
