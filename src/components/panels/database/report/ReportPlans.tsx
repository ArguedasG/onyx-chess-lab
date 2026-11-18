import { SimpleGrid, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { ReportSidePlans } from "@/utils/openingReportPlans";
import { planMoveName } from "../plans";
import classes from "./report.module.css";

/** Each side's typical moves in the next few moves, in any order, as two tables. */
export function ReportPlansTables({ sides }: { sides: ReportSidePlans[] }) {
  const { t } = useTranslation();
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
      {sides.map((side) => (
        <div key={side.white ? "white" : "black"}>
          <div className={classes.label} style={{ marginBottom: 4 }}>
            {side.white ? t("Common.White") : t("Common.Black")} ·{" "}
            {t("OpeningReport.PlansGames", "{{games}} games", {
              games: side.games.toLocaleString(),
            })}
          </div>
          {side.rows.length === 0 ? (
            <div className={classes.caption}>
              {t("OpeningReport.NoPlans", "No move reaches 10% of these games.")}
            </div>
          ) : (
            <table className={classes.table}>
              <thead>
                <tr>
                  <th className={classes.num}>#</th>
                  <th>{t("OpeningReport.PlanMove", "Move")}</th>
                  <th style={{ width: "45%" }}>{t("OpeningReport.PlanShare", "Share of games")}</th>
                  <th className={classes.num}>
                    <Tooltip
                      multiline
                      w={280}
                      label={t(
                        "Plans.DeltaTip",
                        "How these games scored against what the ratings predicted, compared with all games of the position. It is a correlation, not a cause.",
                      )}
                    >
                      <span>{t("OpeningReport.PlanDelta", "vs Elo")}</span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {side.rows.map((row) => (
                  <tr key={`${row.move.piece}${row.move.from}${row.move.to}${row.move.castle}`}>
                    <td className={`${classes.num} ${classes.mono}`}>
                      {Math.round(row.move.typicalMove)}.
                    </td>
                    <td className={classes.mono}>{planMoveName(row.move, row.capture)}</td>
                    <td>
                      <div className={classes.played}>
                        <div className={classes.playedTrack}>
                          <div
                            className={classes.playedFill}
                            style={{ width: `${row.share * 100}%` }}
                          />
                        </div>
                        <span className={classes.mono} style={{ width: 40, textAlign: "right" }}>
                          {Math.round(row.share * 100)}%
                        </span>
                      </div>
                    </td>
                    <td
                      className={`${classes.num} ${classes.mono}`}
                      style={{
                        color:
                          row.delta == null || Math.abs(row.delta) < 2
                            ? "var(--mantine-color-dimmed)"
                            : row.delta > 0
                              ? "var(--mantine-color-teal-text)"
                              : "var(--mantine-color-red-text)",
                      }}
                    >
                      {row.delta == null
                        ? "—"
                        : `${row.delta > 0 ? "+" : ""}${Math.round(row.delta)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </SimpleGrid>
  );
}
