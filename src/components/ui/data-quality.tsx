import { Badge, type BadgeVariant } from "./badge";
import { cn } from "./cn";
import { Icon } from "./icons";
import { Progress, type ProgressTone } from "./progress";

export interface DataQualityIndicatorProps {
  score: number;
  completeness?: number;
  freshness?: number;
  sourceCount?: number;
  issues?: readonly string[];
  compact?: boolean;
  className?: string;
}

function getQuality(score: number): {
  label: string;
  badge: BadgeVariant;
  tone: ProgressTone;
} {
  if (score >= 85) return { label: "신뢰도 높음", badge: "success", tone: "success" };
  if (score >= 65) return { label: "검토 권장", badge: "warning", tone: "warning" };
  return { label: "주의 필요", badge: "danger", tone: "danger" };
}

export function DataQualityIndicator({
  score,
  completeness,
  freshness,
  sourceCount,
  issues = [],
  compact = false,
  className,
}: DataQualityIndicatorProps) {
  const safeScore = Math.min(Math.max(score, 0), 100);
  const quality = getQuality(safeScore);

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-2", className)} title={`데이터 품질 ${Math.round(safeScore)}점`}>
        <span className="relative size-2 rounded-full bg-muted">
          <span
            className={cn(
              "absolute inset-0 rounded-full",
              quality.tone === "success" && "bg-success",
              quality.tone === "warning" && "bg-warning",
              quality.tone === "danger" && "bg-destructive",
            )}
          />
        </span>
        <span className="text-xs text-muted-foreground">품질</span>
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">{Math.round(safeScore)}</span>
      </span>
    );
  }

  return (
    <section className={cn("rounded-lg border border-border bg-muted/25 p-4", className)} aria-label="데이터 품질">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Icon name="database" size={16} className="text-primary" />
            데이터 품질
          </div>
          {sourceCount !== undefined && (
            <p className="mt-1 text-xs text-muted-foreground">검증된 데이터 소스 {sourceCount}개</p>
          )}
        </div>
        <Badge variant={quality.badge} dot>
          {quality.label}
        </Badge>
      </div>
      <Progress value={safeScore} valueLabel={`${Math.round(safeScore)} / 100`} tone={quality.tone} size="sm" />
      {(completeness !== undefined || freshness !== undefined) && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {completeness !== undefined && (
            <div className="rounded-md bg-background/40 p-2">
              <dt className="text-muted-foreground">완전성</dt>
              <dd className="mt-0.5 font-mono font-semibold tabular-nums text-foreground">{Math.round(completeness)}%</dd>
            </div>
          )}
          {freshness !== undefined && (
            <div className="rounded-md bg-background/40 p-2">
              <dt className="text-muted-foreground">최신성</dt>
              <dd className="mt-0.5 font-mono font-semibold tabular-nums text-foreground">{Math.round(freshness)}%</dd>
            </div>
          )}
        </dl>
      )}
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          {issues.map((issue) => (
            <li key={issue} className="flex gap-2">
              <Icon name="alertTriangle" size={13} className="mt-0.5 shrink-0 text-warning" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
