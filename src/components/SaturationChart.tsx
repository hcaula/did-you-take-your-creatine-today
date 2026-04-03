import { useId, useMemo, useState } from "react";
import {
  computeSaturationSeries,
  estimateSaturationDateIfDailyFromPool,
} from "../lib/creatineSaturation";
import {
  addDaysLocalNoon,
  compareISODate,
  formatHumanMonthDay,
  makeLocalNoonDateFromISO,
  toISODateKeyLocal,
  type ISODate,
  type SaveData,
} from "../lib/creatine";

const VIEW_W = 480;
const VIEW_H = 220;
const PAD_L = 44;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 36;

export type SaturationTimeframe = "7d" | "30d" | "1y" | "all";

const TIMEFRAME_OPTIONS: { id: SaturationTimeframe; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "1y", label: "Last year" },
  { id: "all", label: "All time" },
];

function maxISODate(a: ISODate, b: ISODate): ISODate {
  return compareISODate(a, b) >= 0 ? a : b;
}

function chartStartForTimeframe(
  timeframe: SaturationTimeframe,
  todayKey: ISODate,
  trackingStart: ISODate,
): ISODate {
  if (timeframe === "all") return trackingStart;
  const daysBack = timeframe === "7d" ? 6 : timeframe === "30d" ? 29 : 364;
  const candidate = toISODateKeyLocal(
    addDaysLocalNoon(makeLocalNoonDateFromISO(todayKey), -daysBack),
  );
  return maxISODate(trackingStart, candidate);
}

type Props = {
  save: SaveData;
  startDate: ISODate;
  today: ISODate;
};

export function SaturationChart({ save, startDate, today }: Props) {
  const gradId = useId();
  const [timeframe, setTimeframe] = useState<SaturationTimeframe>("30d");

  const chartFrom = useMemo(
    () => chartStartForTimeframe(timeframe, today, startDate),
    [timeframe, today, startDate],
  );

  const fullSeries = useMemo(
    () => computeSaturationSeries(save, startDate, today),
    [save, startDate, today],
  );

  const series = useMemo(
    () => fullSeries.filter((p) => compareISODate(p.date, chartFrom) >= 0),
    [fullSeries, chartFrom],
  );

  const chartW = VIEW_W - PAD_L - PAD_R;
  const chartH = VIEW_H - PAD_T - PAD_B;

  const { linePath, areaPath, xTickIndices } = useMemo(() => {
    const n = series.length;

    if (n === 0) {
      return {
        linePath: "",
        areaPath: "",
        xTickIndices: [] as number[],
      };
    }

    const xAt = (i: number) =>
      PAD_L + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);

    const yAt = (pct: number) => PAD_T + chartH * (1 - pct / 100);

    const points = series.map((p, i) => ({
      x: xAt(i),
      y: yAt(Math.min(p.percent, 100)),
    }));

    const line = points
      .map(
        (pt, i) =>
          `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`,
      )
      .join(" ");

    const floorY = PAD_T + chartH;
    const area =
      points.length > 0
        ? `${line} L ${points[points.length - 1]!.x.toFixed(2)} ${floorY} L ${points[0]!.x.toFixed(2)} ${floorY} Z`
        : "";

    const tickCount = Math.min(4, n);
    const xTickIndices: number[] = [];
    if (tickCount <= 1) {
      if (n === 1) xTickIndices.push(0);
    } else {
      for (let t = 0; t < tickCount; t++) {
        xTickIndices.push(Math.round((t / (tickCount - 1)) * (n - 1)));
      }
    }

    return { linePath: line, areaPath: area, xTickIndices };
  }, [series, chartH, chartW]);

  const yTicks = [0, 50, 100];

  const latest = series.length > 0 ? series[series.length - 1] : null;
  const statusLabel =
    latest == null
      ? "No data"
      : latest.percent >= 99.9
        ? "Saturated"
        : latest.percent >= 85
          ? "Near saturation"
          : "Below saturation";

  const projection = useMemo(() => {
    const last = fullSeries[fullSeries.length - 1];
    if (!last) return null;
    return estimateSaturationDateIfDailyFromPool(last.percent / 100, today);
  }, [fullSeries, today]);

  return (
    <section
      className="wellness-card wellness-saturation"
      aria-labelledby="wellness-saturation-heading"
    >
      {/* Zone 1 — nav-style header */}
      <div className="wellness-saturation-nav">
        <h2
          id="wellness-saturation-heading"
          className="wellness-saturation-title"
        >
          Saturation levels
        </h2>
        <select
          className="wellness-sat-select"
          value={timeframe}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "7d" || v === "30d" || v === "1y" || v === "all") {
              setTimeframe(v);
            }
          }}
          aria-label="Chart time range"
        >
          {TIMEFRAME_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Zone 2 — chart */}
      {series.length === 0 ? (
        <p className="wellness-saturation-empty">
          Adjust your tracking window to see the chart.
        </p>
      ) : (
        <div className="wellness-saturation-chart-wrap">
          <svg
            className="wellness-saturation-svg"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label={`Creatine saturation from ${chartFrom} to ${today}. Currently ${latest?.percent ?? 0}%.`}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--well-sage)"
                  stopOpacity="0.25"
                />
                <stop
                  offset="100%"
                  stopColor="var(--well-sage)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>

            {yTicks.map((v) => {
              const y = PAD_T + chartH * (1 - v / 100);
              return (
                <g key={v}>
                  <line
                    className="wellness-sat-grid"
                    x1={PAD_L}
                    x2={VIEW_W - PAD_R}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className="wellness-sat-axis-y"
                    x={PAD_L - 6}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {v}%
                  </text>
                </g>
              );
            })}

            {areaPath ? (
              <path
                className="wellness-sat-area"
                d={areaPath}
                fill={`url(#${gradId})`}
              />
            ) : null}
            {linePath ? (
              <path className="wellness-sat-line" d={linePath} fill="none" />
            ) : null}

            {(() => {
              const last = series.length - 1;
              const p = series[last];
              if (!p) return null;
              const x =
                PAD_L +
                (series.length === 1
                  ? chartW / 2
                  : (last / (series.length - 1)) * chartW);
              const y = PAD_T + chartH * (1 - Math.min(p.percent, 100) / 100);
              return (
                <circle
                  className="wellness-sat-dot"
                  cx={x}
                  cy={y}
                  r={4}
                  aria-hidden
                />
              );
            })()}

            {xTickIndices.map((idx) => {
              const p = series[idx];
              if (!p) return null;
              const x =
                PAD_L +
                (series.length === 1
                  ? chartW / 2
                  : (idx / (series.length - 1)) * chartW);
              const label = formatHumanMonthDay(
                makeLocalNoonDateFromISO(p.date),
              );
              return (
                <text
                  key={p.date}
                  className="wellness-sat-axis-x"
                  x={x}
                  y={VIEW_H - 8}
                  textAnchor="middle"
                >
                  {label}
                </text>
              );
            })}
          </svg>
        </div>
      )}

      {/* Zone 3 — summary row */}
      {latest && (
        <div className="wellness-saturation-summary" aria-live="polite">
          <div className="wellness-saturation-summary-left">
            {/* <span className="wellness-saturation-summary-label">Today</span> */}
            <span className="wellness-saturation-summary-value">
              {latest.percent}%
            </span>
          </div>
          <div className="wellness-saturation-summary-bar" role="presentation">
            <div
              className="wellness-saturation-summary-bar-fill"
              style={{ width: `${Math.min(latest.percent, 100)}%` }}
            />
          </div>
          <span className="wellness-saturation-summary-status">
            {statusLabel}
          </span>
        </div>
      )}

      {latest && projection && projection.kind === "date" && (
        <p className="wellness-sat-projection-caption">
          Full saturation in {projection.daysAhead} day
          {projection.daysAhead === 1 ? "" : "s"}
        </p>
      )}
    </section>
  );
}
