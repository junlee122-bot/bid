import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-6 text-center">
      <div>
        <p className="font-mono text-sm text-primary">404 · CONTRACT_NOT_FOUND</p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">해당 분석 대상을 찾을 수 없습니다</h1>
        <p className="mt-3 text-sm text-muted-foreground">계약 목록으로 돌아가 다른 대상을 선택해 주세요.</p>
        <Link href="/contracts" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">계약 목록 보기</Link>
      </div>
    </div>
  );
}
