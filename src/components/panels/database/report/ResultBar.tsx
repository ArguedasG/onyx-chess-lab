import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { ReportResults } from "@/bindings";
import classes from "./report.module.css";

/** White wins / draws / black wins as one bar; games without a result are left out. */
export default function ResultBar({
  results,
  thin = false,
}: {
  results: ReportResults;
  thin?: boolean;
}) {
  const { t } = useTranslation();
  const known = results.white + results.draw + results.black;
  if (!known) return <span className={classes.caption}>—</span>;
  const parts = [
    { key: "white", value: results.white, className: classes.white },
    { key: "draw", value: results.draw, className: classes.draw },
    { key: "black", value: results.black, className: classes.black },
  ].filter((part) => part.value > 0);
  const percent = (value: number) => (value / known) * 100;
  const label = [
    `${t("OpeningReport.Bar.White", "White")} ${percent(results.white).toFixed(1)}% (${results.white.toLocaleString()})`,
    `${t("OpeningReport.Bar.Draw", "Draws")} ${percent(results.draw).toFixed(1)}% (${results.draw.toLocaleString()})`,
    `${t("OpeningReport.Bar.Black", "Black")} ${percent(results.black).toFixed(1)}% (${results.black.toLocaleString()})`,
  ].join(" · ");

  return (
    <Tooltip label={label} openDelay={250}>
      <div className={`${classes.resultBar} ${thin ? classes.thin : ""}`} aria-label={label}>
        {parts.map((part) => (
          <div
            key={part.key}
            className={`${classes.segment} ${part.className}`}
            style={{ flex: `${part.value} 1 0` }}
          >
            {!thin && percent(part.value) >= 12 && `${Math.round(percent(part.value))}%`}
          </div>
        ))}
      </div>
    </Tooltip>
  );
}
