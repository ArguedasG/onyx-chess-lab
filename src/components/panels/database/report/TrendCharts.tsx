import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MIN_TREND_SCORE_GAMES, type TrendSeries } from "@/utils/openingReportFilters";
import classes from "./report.module.css";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const AXIS = { fontSize: 11, fill: "var(--mantine-color-dimmed)" };

function TrendChart({
  trend,
  values,
  domain,
  ticks,
}: {
  trend: TrendSeries;
  values: Record<string, (number | null)[]>;
  domain: [number, number];
  ticks: number[];
}) {
  const data = trend.years.map((year, index) => {
    const row: Record<string, number | null> = { year };
    for (const move of trend.moves) row[move] = values[move][index];
    return row;
  });
  const last = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={data} margin={{ top: 8, right: 72, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke="var(--mantine-color-default-border)" />
        <XAxis
          dataKey="year"
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: "var(--mantine-color-default-border)" }}
          minTickGap={24}
        />
        <YAxis
          domain={domain}
          ticks={ticks}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => `${value}%`}
        />
        <Tooltip
          cursor={{ stroke: "var(--mantine-color-dimmed)", strokeDasharray: "3 3" }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className={classes.tooltip}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>
                {payload.map((entry) => (
                  <div key={String(entry.dataKey)}>
                    <span className={classes.swatch} style={{ background: entry.color }} />
                    {String(entry.dataKey)}{" "}
                    {typeof entry.value === "number" ? `${entry.value.toFixed(1)}%` : "—"}
                  </div>
                ))}
              </div>
            ) : null
          }
        />
        {trend.moves.map((move, index) => (
          <Line
            key={move}
            dataKey={move}
            type="monotone"
            stroke={SERIES[index]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--mantine-color-body)" }}
            connectNulls={false}
            isAnimationActive={false}
            // Direct label at the line's end: the move and its latest value, in text ink.
            label={(props: {
              index?: number;
              x?: number | string;
              y?: number | string;
              value?: unknown;
            }) =>
              props.index === last && typeof props.value === "number" ? (
                <text
                  x={Number(props.x ?? 0) + 6}
                  y={Number(props.y ?? 0) + 4}
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--mantine-color-text)"
                >
                  {move} {Math.round(props.value)}%
                </text>
              ) : (
                <g />
              )
            }
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Popularity and score of the main moves over the years, smoothed over five years. */
export default function TrendCharts({
  trend,
  moverIsWhite,
}: {
  trend: TrendSeries;
  moverIsWhite: boolean;
}) {
  const { t } = useTranslation();
  const scores = Object.values(trend.score)
    .flat()
    .filter((value): value is number => value !== null);
  const low = scores.length ? Math.max(0, Math.floor(Math.min(...scores) / 10) * 10) : 30;
  const high = Math.max(
    low + 10,
    scores.length ? Math.min(100, Math.ceil(Math.max(...scores) / 10) * 10) : 70,
  );
  const scoreTicks = Array.from({ length: (high - low) / 10 + 1 }, (_, i) => low + i * 10);

  const legend = (
    <div className={classes.legend}>
      {trend.moves.map((move, index) => (
        <span key={move}>
          <span className={classes.swatch} style={{ background: SERIES[index] }} />
          {move}
        </span>
      ))}
    </div>
  );

  return (
    <div>
      <div className={classes.sectionTitle}>
        {t("OpeningReport.Fashion", "How the fashion has shifted")}
      </div>
      <div className={classes.caption} style={{ marginBottom: 6 }}>
        {t(
          "OpeningReport.FashionScope",
          "Share of this position's games that chose each move, smoothed over five years. {{first}}–{{last}}.",
          { first: trend.years[0], last: trend.years.at(-1) },
        )}
      </div>
      {legend}
      <TrendChart
        trend={trend}
        values={trend.share}
        domain={[0, 100]}
        ticks={[0, 25, 50, 75, 100]}
      />
      {scores.length > 0 && (
        <>
          <div className={classes.sectionTitle} style={{ marginTop: 14 }}>
            {moverIsWhite
              ? t("OpeningReport.WhiteScoredWith", "And how White scored with them")
              : t("OpeningReport.BlackScoredWith", "And how Black scored with them")}
          </div>
          <div className={classes.caption} style={{ marginBottom: 6 }}>
            {t(
              "OpeningReport.ScoreTrendScope",
              "Gaps mean fewer than {{count}} games in that five-year window.",
              { count: MIN_TREND_SCORE_GAMES },
            )}
          </div>
          <TrendChart trend={trend} values={trend.score} domain={[low, high]} ticks={scoreTicks} />
        </>
      )}
    </div>
  );
}
