import { cn } from "./cn";

export interface ChartDatum {
  label: string;
  value: number;
}

function normalizeData(data: ReadonlyArray<number | ChartDatum>): ChartDatum[] {
  return data.map((item, index) =>
    typeof item === "number" ? { label: String(index + 1), value: item } : item,
  );
}

function finiteValues(data: readonly ChartDatum[]): number[] {
  return data.map((item) => item.value).filter(Number.isFinite);
}

export interface MiniLineChartProps {
  data: ReadonlyArray<number | ChartDatum>;
  ariaLabel?: string;
  className?: string;
  color?: string;
  height?: number;
  showPoints?: boolean;
}

export function MiniLineChart({
  data: rawData,
  ariaLabel = "추이 차트",
  className,
  color = "var(--primary)",
  height = 96,
  showPoints = false,
}: MiniLineChartProps) {
  const data = normalizeData(rawData);
  const values = finiteValues(data);
  if (values.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-xs text-muted-foreground", className)} style={{ height }}>
        표시할 데이터가 없습니다
      </div>
    );
  }

  const width = 320;
  const padding = 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const denominator = Math.max(data.length - 1, 1);
  const points = data.map((item, index) => ({
    x: padding + (index / denominator) * (width - padding * 2),
    y: padding + ((max - item.value) / range) * (height - padding * 2),
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
      className={cn("block w-full overflow-visible", className)}
      style={{ height }}
    >
      <title>{ariaLabel}</title>
      <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="var(--border)" />
      <polygon points={area} fill={color} opacity="0.09" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {(showPoints || data.length <= 8) &&
        points.map((point, index) => (
          <circle
            key={`${data[index]?.label}-${index}`}
            cx={point.x}
            cy={point.y}
            r="2.7"
            fill="var(--card)"
            stroke={color}
            strokeWidth="1.7"
            vectorEffect="non-scaling-stroke"
          />
        ))}
    </svg>
  );
}

export interface HorizontalBarDatum extends ChartDatum {
  color?: string;
  valueLabel?: string;
}

export interface HorizontalBarChartProps {
  data: readonly HorizontalBarDatum[];
  ariaLabel?: string;
  className?: string;
  max?: number;
  formatValue?: (value: number) => string;
}

export function HorizontalBarChart({
  data,
  ariaLabel = "항목별 비교 차트",
  className,
  max,
  formatValue = (value) => value.toLocaleString("ko-KR"),
}: HorizontalBarChartProps) {
  const computedMax = max ?? Math.max(...finiteValues(data), 1);
  const chartMax = computedMax > 0 ? computedMax : 1;
  const rowHeight = 38;
  const width = 640;
  const labelWidth = 155;
  const plotWidth = 390;
  const height = Math.max(data.length * rowHeight + 10, 48);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className={cn("block h-auto w-full", className)}
    >
      <title>{ariaLabel}</title>
      {data.length === 0 && (
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">
          표시할 데이터가 없습니다
        </text>
      )}
      {data.map((item, index) => {
        const y = index * rowHeight + 9;
        const barWidth = Math.max(0, Math.min(item.value / chartMax, 1)) * plotWidth;
        return (
          <g key={`${item.label}-${index}`}>
            <text x="0" y={y + 14} fill="var(--muted-foreground)" fontSize="12">
              {item.label.length > 16 ? `${item.label.slice(0, 15)}…` : item.label}
            </text>
            <rect x={labelWidth} y={y} width={plotWidth} height="18" rx="5" fill="var(--muted)" />
            <rect
              x={labelWidth}
              y={y}
              width={barWidth}
              height="18"
              rx="5"
              fill={item.color ?? "var(--primary)"}
              opacity="0.88"
            />
            <text
              x={width - 3}
              y={y + 13.5}
              textAnchor="end"
              fill="var(--foreground)"
              fontFamily="var(--font-mono)"
              fontSize="11"
              fontWeight="600"
            >
              {item.valueLabel ?? formatValue(item.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface DonutDatum extends ChartDatum {
  color?: string;
}

export interface DonutChartProps {
  data: readonly DonutDatum[];
  ariaLabel?: string;
  className?: string;
  centerLabel?: string;
  centerValue?: string;
  showLegend?: boolean;
}

const donutColors = [
  "var(--primary)",
  "var(--warning)",
  "var(--success)",
  "oklch(0.66 0.16 260)",
  "var(--destructive)",
] as const;

export function DonutChart({
  data,
  ariaLabel = "구성 비율 차트",
  className,
  centerLabel,
  centerValue,
  showLegend = true,
}: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <figure className={cn("flex min-w-0 items-center gap-5", className)} aria-label={ariaLabel}>
      <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel} className="size-32 shrink-0 -rotate-90">
        <title>{ariaLabel}</title>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--muted)" strokeWidth="14" />
        {total > 0 &&
          data.map((item, index) => {
            const value = Math.max(item.value, 0);
            const segment = (value / total) * circumference;
            const offset = -(cumulative / total) * circumference;
            cumulative += value;
            return (
              <circle
                key={`${item.label}-${index}`}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={item.color ?? donutColors[index % donutColors.length]}
                strokeWidth="14"
                strokeLinecap="butt"
                strokeDasharray={`${segment} ${circumference - segment}`}
                strokeDashoffset={offset}
              />
            );
          })}
        <g className="rotate-90 origin-center">
          {centerValue && (
            <text x="60" y="58" textAnchor="middle" fill="var(--foreground)" fontSize="17" fontWeight="700">
              {centerValue}
            </text>
          )}
          {centerLabel && (
            <text x="60" y={centerValue ? 73 : 64} textAnchor="middle" fill="var(--muted-foreground)" fontSize="8.5">
              {centerLabel}
            </text>
          )}
        </g>
      </svg>
      {showLegend && (
        <figcaption className="min-w-0 flex-1 space-y-2">
          {data.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full" style={{ background: item.color ?? donutColors[index % donutColors.length] }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">
                {total > 0 ? `${Math.round((Math.max(item.value, 0) / total) * 100)}%` : "0%"}
              </span>
            </div>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

export interface RadarDatum {
  label: string;
  value: number;
  max?: number;
}

export interface RadarChartProps {
  data: readonly RadarDatum[];
  ariaLabel?: string;
  className?: string;
  color?: string;
}

export function RadarChart({
  data,
  ariaLabel = "리스크 요인 레이더 차트",
  className,
  color = "var(--primary)",
}: RadarChartProps) {
  const count = data.length;
  if (count < 3) return null;
  const size = 260;
  const center = size / 2;
  const radius = 82;
  const position = (index: number, ratio: number) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return { x: center + Math.cos(angle) * radius * ratio, y: center + Math.sin(angle) * radius * ratio };
  };
  const levels = [0.25, 0.5, 0.75, 1];
  const valuePoints = data
    .map((item, index) => {
      const point = position(index, Math.min(Math.max(item.value / (item.max ?? 100), 0), 1));
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel} className={cn("h-auto w-full", className)}>
      <title>{ariaLabel}</title>
      {levels.map((level) => (
        <polygon
          key={level}
          points={data.map((_, index) => { const point = position(index, level); return `${point.x},${point.y}`; }).join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      {data.map((item, index) => {
        const outer = position(index, 1);
        const label = position(index, 1.22);
        return (
          <g key={`${item.label}-${index}`}>
            <line x1={center} y1={center} x2={outer.x} y2={outer.y} stroke="var(--border)" />
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" fontSize="10">
              {item.label}
            </text>
          </g>
        );
      })}
      <polygon points={valuePoints} fill={color} fillOpacity="0.14" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {data.map((item, index) => {
        const point = position(index, Math.min(Math.max(item.value / (item.max ?? 100), 0), 1));
        return <circle key={`${item.label}-point`} cx={point.x} cy={point.y} r="3" fill="var(--card)" stroke={color} strokeWidth="2" />;
      })}
    </svg>
  );
}
