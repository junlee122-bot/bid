import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icons";
import { formatCompactKrw, riskMeta } from "@/lib/format";
import type { DataQuality, RiskLevel } from "@/lib/domain";

export function compactWon(value: number): string {
  return `${formatCompactKrw(value)}원`;
}

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const meta = riskMeta[level];

  return (
    <Badge variant={meta.badge} dot aria-label={`위험 수준 ${meta.label}${score === undefined ? "" : `, ${score}점`}`}>
      {meta.label}
      {score !== undefined && <span className="font-mono tabular-nums">{score}</span>}
    </Badge>
  );
}

const qualityMeta: Record<DataQuality, { label: string; variant: "success" | "warning" | "neutral" }> = {
  verified: { label: "검증 데이터", variant: "success" },
  estimated: { label: "추정 포함", variant: "warning" },
  synthetic: { label: "합성 데이터", variant: "neutral" },
};

export function DataQualityBadge({ quality }: { quality: DataQuality }) {
  const meta = qualityMeta[quality];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function MetricCard({
  label,
  value,
  description,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  description: string;
  icon: IconName;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-destructive/10 text-red-300",
  }[tone];

  return (
    <Card className="min-w-0">
      <CardContent className="pt-5 sm:pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 truncate font-mono text-2xl font-semibold tracking-[-0.04em] text-foreground tabular-nums">
              {value}
            </p>
          </div>
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`} aria-hidden="true">
            <Icon name={icon} size={18} />
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function ActionLink({
  href,
  children,
  icon = "arrowRight",
  variant = "outline",
}: {
  href: string;
  children: React.ReactNode;
  icon?: IconName;
  variant?: "primary" | "outline" | "ghost";
}) {
  const variants = {
    primary: "border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border-border bg-transparent text-foreground hover:border-primary/40 hover:bg-primary/8",
    ghost: "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  };

  return (
    <Link
      href={href}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${variants[variant]}`}
    >
      {children}
      <Icon name={icon} size={16} />
    </Link>
  );
}

export function EmptyContracts({ filtered = false }: { filtered?: boolean }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden="true">
        <Icon name={filtered ? "search" : "briefcase"} size={22} />
      </span>
      <p className="mt-4 text-sm font-semibold text-foreground">
        {filtered ? "조건에 맞는 계약이 없습니다" : "분석할 계약이 없습니다"}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
        {filtered
          ? "검색어나 위험 필터를 바꾸어 다시 확인해 보세요."
          : "데이터 허브에서 CSV를 불러오거나 공공조달 계약을 추가해 주세요."}
      </p>
    </div>
  );
}
