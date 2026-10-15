import { SegmentedControl, Tooltip, UnstyledButton } from "@mantine/core";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReportEloBand, ReportPlayer, ReportResults } from "@/bindings";
import { reportGames } from "@/utils/openingReport";
import {
  MIN_PERFORMANCE_GAMES,
  type MoveRow,
  type MoveTrend,
  moverPerformance,
  moverScore,
  TREND_RECENT_YEARS,
} from "@/utils/openingReportFilters";
import { bandLabel } from "./ReportFiltersBar";
import ResultBar from "./ResultBar";
import classes from "./report.module.css";

const percent = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);

/** Popularity change of a continuation, with the shares it compares in the tooltip. */
function TrendMark({ trend }: { trend: MoveTrend }) {
  const { t } = useTranslation();
  const Icon = trend.direction === "up" ? IconTrendingUp : IconTrendingDown;
  return (
    <Tooltip
      label={t(
        "OpeningReport.TrendTooltip",
        "Played in {{recent}}% of the games of the last {{years}} years, against {{earlier}}% before.",
        {
          recent: trend.recentShare.toFixed(1),
          earlier: trend.earlierShare.toFixed(1),
          years: TREND_RECENT_YEARS,
        },
      )}
    >
      <Icon
        size="0.9rem"
        style={{ marginLeft: 4, verticalAlign: "-0.15em" }}
        color={
          trend.direction === "up" ? "var(--mantine-color-teal-6)" : "var(--mantine-color-orange-6)"
        }
        aria-label={
          trend.direction === "up"
            ? t("OpeningReport.TrendUp", "Gaining popularity")
            : t("OpeningReport.TrendDown", "Losing popularity")
        }
      />
    </Tooltip>
  );
}

/** Score against the Elo expectation of the side choosing the move. */
function PerformanceCell({ row, moverIsWhite }: { row: MoveRow; moverIsWhite: boolean }) {
  const { t } = useTranslation();
  const performance = moverPerformance(row.rated, moverIsWhite);
  if (!performance) {
    return (
      <Tooltip
        label={t(
          "OpeningReport.PerformanceThin",
          "Fewer than {{min}} games with both ratings: not shown.",
          { min: MIN_PERFORMANCE_GAMES },
        )}
      >
        <span>—</span>
      </Tooltip>
    );
  }
  const delta = performance.delta;
  return (
    <Tooltip
      multiline
      w={260}
      label={t(
        "OpeningReport.PerformanceTooltip",
        "Scores {{score}}% where the rating difference predicts {{expected}}%, over {{games}} games with both ratings.",
        {
          score: performance.score.toFixed(1),
          expected: performance.expected.toFixed(1),
          games: performance.games.toLocaleString(),
        },
      )}
    >
      <span
        style={{
          color:
            Math.abs(delta) < 1
              ? undefined
              : delta > 0
                ? "var(--mantine-color-teal-6)"
                : "var(--mantine-color-red-6)",
        }}
      >
        {delta > 0 ? "+" : ""}
        {delta.toFixed(1)}
      </span>
    </Tooltip>
  );
}

/** Continuations: how often each is played, how it scores, and on how many games. */
export function MovesTable({
  rows,
  trends,
  moverIsWhite,
  onMove,
  readOnly,
}: {
  rows: MoveRow[];
  trends?: Map<string, MoveTrend>;
  moverIsWhite: boolean;
  onMove: (move: string) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const total = rows.reduce((sum, row) => sum + reportGames(row.results), 0);
  const top = Math.max(1, ...rows.map((row) => reportGames(row.results)));
  if (!rows.length) {
    return (
      <div className={classes.caption}>
        {t("OpeningReport.NoMovesForFilter", "No games match these filters.")}
      </div>
    );
  }
  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th>{t("OpeningReport.Move")}</th>
          <th style={{ width: "28%" }}>{t("OpeningReport.Played", "Played")}</th>
          <th style={{ width: "34%" }}>{t("OpeningReport.Results", "White / draws / black")}</th>
          <th className={classes.num}>
            {moverIsWhite
              ? t("OpeningReport.WhiteScores", "White scores")
              : t("OpeningReport.BlackScores", "Black scores")}
          </th>
          <th className={classes.num}>
            <Tooltip
              multiline
              w={260}
              label={t(
                "OpeningReport.PerformanceHelp",
                "Score minus the score expected from the rating difference, in points: it discounts that a move is mostly played by the stronger side.",
              )}
            >
              <span>{t("OpeningReport.Performance", "vs. expected")}</span>
            </Tooltip>
          </th>
          <th className={classes.num}>{t("OpeningReport.Games")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const games = reportGames(row.results);
          return (
            <tr key={row.move}>
              <td>
                {row.move === "*" ? (
                  <span className={classes.caption}>{t("OpeningReport.End")}</span>
                ) : (
                  <UnstyledButton
                    className={classes.moveButton}
                    disabled={readOnly}
                    onClick={() => onMove(row.move)}
                  >
                    {row.move}
                  </UnstyledButton>
                )}
                {trends?.get(row.move) && <TrendMark trend={trends.get(row.move)!} />}
              </td>
              <td>
                <div className={classes.played}>
                  <div className={classes.playedTrack}>
                    <div
                      className={classes.playedFill}
                      style={{ width: `${(games / top) * 100}%` }}
                    />
                  </div>
                  <span className={classes.mono} style={{ width: 48, textAlign: "right" }}>
                    {total ? `${((games / total) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              </td>
              <td>
                <ResultBar results={row.results} />
              </td>
              <td className={`${classes.num} ${classes.mono}`}>
                {percent(moverScore(row.results, moverIsWhite))}
              </td>
              <td className={`${classes.num} ${classes.mono}`}>
                <PerformanceCell row={row} moverIsWhite={moverIsWhite} />
              </td>
              <td className={`${classes.num} ${classes.mono}`}>{games.toLocaleString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** How the position holds up in each rating class. */
export function EloBandsTable({
  bands,
  results,
  selected,
  moverIsWhite,
}: {
  bands: ReportEloBand[];
  results: ReportResults[];
  selected: number | null;
  moverIsWhite: boolean;
}) {
  const { t } = useTranslation();
  return (
    <table className={classes.table}>
      <thead>
        <tr>
          <th>{t("OpeningReport.EloBand")}</th>
          <th style={{ width: "55%" }}>{t("OpeningReport.Results", "White / draws / black")}</th>
          <th className={classes.num}>
            {moverIsWhite
              ? t("OpeningReport.WhiteScores", "White scores")
              : t("OpeningReport.BlackScores", "Black scores")}
          </th>
          <th className={classes.num}>{t("OpeningReport.Games")}</th>
        </tr>
      </thead>
      <tbody>
        {bands.map((band, index) => {
          const bandResults = results[index];
          const games = bandResults ? reportGames(bandResults) : 0;
          if (!games) return null;
          return (
            <tr key={band.minElo} className={selected === index ? classes.selectedRow : undefined}>
              <td className={classes.mono}>{bandLabel(band.minElo, band.maxElo)}</td>
              <td>
                <ResultBar results={bandResults} />
              </td>
              <td className={`${classes.num} ${classes.mono}`}>
                {percent(moverScore(bandResults, moverIsWhite))}
              </td>
              <td className={`${classes.num} ${classes.mono}`}>{games.toLocaleString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Who plays the position: most frequent or strongest, one line each. */
export function PlayersList({
  mostPlayed,
  strongest,
  onPlayer,
  disabled,
  disabledReason,
}: {
  mostPlayed: ReportPlayer[];
  strongest: ReportPlayer[];
  onPlayer: (id: number, name: string) => void;
  disabled: boolean;
  disabledReason?: string;
}) {
  const { t } = useTranslation();
  const [list, setList] = useState<"frequent" | "strongest">("frequent");
  const players = (list === "frequent" ? mostPlayed : strongest).slice(0, 10);
  const score = (player: ReportPlayer) => {
    const known = player.wins + player.draws + player.losses;
    return known ? `${(((player.wins + player.draws / 2) / known) * 100).toFixed(1)}%` : "—";
  };
  const years = (player: ReportPlayer) =>
    player.firstYear == null
      ? null
      : player.firstYear === player.lastYear
        ? String(player.firstYear)
        : `${player.firstYear}–${player.lastYear}`;

  return (
    <div>
      <SegmentedControl
        size="xs"
        mb={6}
        value={list}
        onChange={(value) => setList(value as typeof list)}
        data={[
          { value: "frequent", label: t("OpeningReport.FrequentPlayers") },
          { value: "strongest", label: t("OpeningReport.StrongestPlayers") },
        ]}
      />
      {players.map((player) => (
        <div key={player.id} className={classes.player}>
          <Tooltip
            label={disabledReason ?? t("OpeningReport.PlayerGames", "See their games from here")}
            openDelay={300}
          >
            <UnstyledButton
              className={classes.playerName}
              disabled={disabled}
              onClick={() => onPlayer(player.id, player.name)}
            >
              {player.name}
            </UnstyledButton>
          </Tooltip>
          {player.averageElo != null && (
            <span className={classes.playerMeta}>{player.averageElo.toFixed(0)}</span>
          )}
          <span className={classes.playerMeta}>
            {[
              t("OpeningReport.PlayerGamesCount", "{{count}} games", { count: player.games }),
              score(player),
              t("OpeningReport.PlayerColors", "{{white}}W/{{black}}B", {
                white: player.whiteGames,
                black: player.blackGames,
              }),
              years(player),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ))}
    </div>
  );
}
