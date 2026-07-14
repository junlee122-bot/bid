"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/brand/logo";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Sheet } from "@/components/ui/sheet";

const navigation = [
  { href: "/", label: "포트폴리오", icon: "grid" },
  { href: "/contracts", label: "계약 탐색", icon: "document" },
  { href: "/scenario", label: "시나리오 랩", icon: "pulse" },
  { href: "/decision", label: "의사결정실", icon: "decision" },
  { href: "/data", label: "데이터 허브", icon: "database" },
  { href: "/methodology", label: "방법론", icon: "book" },
] as const;

function NavIcon({ name }: { name: (typeof navigation)[number]["icon"] }) {
  const paths: Record<typeof name, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    document: <><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></>,
    pulse: <><path d="M3 12h4l2.4-6 4.2 12 2.2-6H21"/></>,
    decision: <><path d="M12 3v18M5 6h14M5 6l-3 7h6zM19 6l-3 7h6zM8 21h8"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23z"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Wordmark() {
  return (
    <Link href="/" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="BID SHIELD 홈">
      <BrandLogo size="sm" subtitle="CONTRACT INTELLIGENCE" />
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="space-y-1">
      {navigation.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
            {active && <span aria-hidden="true" className="ms-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { contracts, source, updatedAt, hydrated } = useWorkspace();
  const sourceLabel = { demo: "합성 데모", csv: "CSV 반입", api: "나라장터 API", mixed: "혼합 데이터" }[source];

  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="fixed start-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xl transition-transform focus:translate-y-0"
      >
        본문으로 건너뛰기
      </a>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e bg-background/88 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <Wordmark />
        <div className="mt-8 flex-1"><Navigation /></div>
        <div className="rounded-xl border bg-card/80 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_10px_var(--success)]" />
            분석 엔진 정상
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">현재 {sourceLabel}로 작동합니다. 데이터 허브에서 나라장터 API 또는 CSV를 연결할 수 있습니다.</p>
        </div>
        <div className="mt-4 font-mono text-[10px] text-muted-foreground">MODEL · DECISION ENGINE v2.0</div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/88 px-4 backdrop-blur-xl lg:ms-64 lg:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <button type="button" onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border bg-card text-foreground" aria-label="메뉴 열기" aria-expanded={mobileOpen} aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
          <Wordmark />
        </div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
          <span className="rounded-full border bg-card px-2.5 py-1 font-mono">2026.07 분석 기준</span>
          <span className="rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-warning">시나리오 기반 · 보장값 아님</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-end sm:block">
            <p className="text-xs font-medium">{sourceLabel} 워크스페이스</p>
            <p className="text-[10px] text-muted-foreground">
              {hydrated
                ? `계약 ${contracts.length.toLocaleString("ko-KR")}건 · ${new Intl.DateTimeFormat("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                    timeZone: "Asia/Seoul",
                  }).format(new Date(updatedAt))} 갱신`
                : "워크스페이스 불러오는 중"}
            </p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-full border bg-primary/10 text-xs font-semibold text-primary">BS</span>
        </div>
      </header>

      <Sheet
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        title="BID SHIELD"
        description="CONTRACT INTELLIGENCE"
        side="left"
        className="w-[82%] max-w-72 bg-background lg:hidden"
      >
        <Navigation onNavigate={() => setMobileOpen(false)} />
      </Sheet>

      <main id="main-content" tabIndex={-1} className="surface-grid min-h-[calc(100dvh-4rem)] px-4 py-6 sm:px-6 lg:ms-64 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-[1480px]">{children}</div>
      </main>
    </div>
  );
}
