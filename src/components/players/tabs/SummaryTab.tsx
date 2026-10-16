import { BarChart, LineChart } from "@mantine/charts";
import { Alert, Group, Paper, SegmentedControl, SimpleGrid, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import { engineHighlights, playerHighlights } from "@/utils/players/highlights";
import type { ProfileGame } from "@/utils/players/profileGames";
import {
  activityByMonth,
  groupResults,
  ratingHistory,
  ratingSummaries,
  resultBucket,
} from "@/utils/players/results";
import { MIN_RATING_PAR_GAMES } from "@/utils/ratingPar";
import { RatingParValue, ResultBar, SectionTitle, StatTile } from "../common";
import { formatScore, timeControlLabel } from "../labels";
import HabitsSection from "./HabitsSection";
import HighlightsSection from "./HighlightsSection";

const SERIES_COLORS: Record<string, string> = {
  ultra_bullet: "pink.6",
  bullet: "orange.6",
  blitz: "yellow.6",
  rapid: "teal.6",
  classical: "blue.6",
  correspondence: "grape.6",
  daily: "grape.6",
  unknown: "gray.6",
};

export default function SummaryTab({
  games,
  engine,
  onOpenGame,
  onShowRivals,
}: {
  games: ProfileGame[];
  engine: PlayerEngineAnalysis | null;
  onOpenGame: (game: ProfileGame, ply?: number | null) => void;
  onShowRivals: () => void;
}) {
  const { t } = useTranslation();
  const summary = useMemo(() => resultBucket("all", games), [games]);
  const byColor = useMemo(
    () => groupResults(games, (game) => (game.isWhite ? "white" : "black")),
    [games],
  );
  const byTimeControl = useMemo(
    () => groupResults(games, (game) => game.timeControlCategory),
    [games],
  );
  const ratings = useMemo(() => ratingSummaries(games), [games]);
  const highlights = useMemo(() => playerHighlights(games), [games]);
  const engineMoments = useMemo(() => engineHighlights(engine, games), [engine, games]);
  const analyzedInView = useMemo(() => {
    if (!engine) return 0;
    const keys = new Set(games.map((game) => game.key));
    return engine.games.filter((metrics) => keys.has(metrics.key)).length;
  }, [engine, games]);

  if (games.length === 0) {
    return (
      <Alert color="gray" mt="md">
        {t("Players.NoGamesInFilter", "No games match the current filters.")}
      </Alert>
    );
  }

  const main = ratings[0];
  return (
    <Stack gap="lg" pb="xl">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <StatTile
          label={t("Players.Games", "Games")}
          value={summary.games.toLocaleString()}
          hint={
            analyzedInView
              ? t("Players.AnalyzedHint", "{{count}} analyzed with the engine", {
                  count: analyzedInView,
                })
              : t("Players.NotAnalyzedHint", "None analyzed with the engine yet")
          }
        />
        <StatTile
          label={t("Players.Score", "Score")}
          value={formatScore(summary.scorePercent)}
          hint={`${summary.wins} · ${summary.draws} · ${summary.losses} (${t("PlayerAnalysis.Record", "W-D-L")})`}
        />
        <StatTile
          label={t("RatingPar.Title", "Rating par")}
          value={<RatingParValue par={summary} size="22px" />}
          hint={
            summary.ratedGames >= MIN_RATING_PAR_GAMES
              ? t("RatingPar.Hint", "{{score}} vs {{expected}} expected", {
                  score: formatScore(summary.ratedScorePercent),
                  expected: formatScore(summary.expectedPercent),
                })
              : t("RatingPar.HintSmall", "Needs {{count}} rated games", {
                  count: MIN_RATING_PAR_GAMES,
                })
          }
        />
        <StatTile
          label={
            main
              ? t("Players.RatingOf", "Rating · {{timeControl}}", {
                  timeControl: timeControlLabel(main.timeControl, t),
                })
              : t("Players.Rating", "Rating")
          }
          value={main ? main.current : "—"}
          hint={
            main
              ? t("Players.PeakRating", "Peak {{peak}}", { peak: main.peak })
              : t("Players.NoRatings", "No ratings in these games")
          }
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <SectionTitle title={t("Players.ByColor", "By color")} />
            {byColor.map((bucket) => (
              <ResultRow
                key={bucket.key}
                label={bucket.key === "white" ? t("Fen.White", "White") : t("Fen.Black", "Black")}
                bucket={bucket}
              />
            ))}
            <SectionTitle title={t("Players.ByTimeControl", "By time control")} />
            {byTimeControl.slice(0, 5).map((bucket) => (
              <ResultRow
                key={bucket.key}
                label={timeControlLabel(bucket.key as ProfileGame["timeControlCategory"], t)}
                bucket={bucket}
              />
            ))}
          </Stack>
        </Paper>
        <RatingChart games={games} />
      </SimpleGrid>

      <ActivityChart games={games} />

      <HighlightsSection
        highlights={highlights}
        engine={engineMoments}
        analyzedGames={analyzedInView}
        onOpenGame={onOpenGame}
        onShowRivals={onShowRivals}
        games={games}
      />

      <HabitsSection games={games} engine={engine} onOpenGame={onOpenGame} />
    </Stack>
  );
}

function ResultRow({ label, bucket }: { label: string; bucket: ReturnType<typeof resultBucket> }) {
  const { t } = useTranslation();
  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Group gap="md" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {t("Players.GamesCount", "{{count}} games", { count: bucket.games })}
          </Text>
          <Text size="sm" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatScore(bucket.scorePercent)}
          </Text>
          <RatingParValue par={bucket} />
        </Group>
      </Group>
      <ResultBar wins={bucket.wins} draws={bucket.draws} losses={bucket.losses} size="sm" />
    </Stack>
  );
}

function RatingChart({ games }: { games: ProfileGame[] }) {
  const { t } = useTranslation();
  const history = useMemo(() => ratingHistory(games), [games]);
  const series = useMemo(() => {
    const counts = new Map<string, number>();
    for (const point of history)
      for (const key of Object.keys(point))
        if (key !== "month") counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => ({
        name,
        label: timeControlLabel(name as ProfileGame["timeControlCategory"], t),
        color: SERIES_COLORS[name] ?? "gray.6",
      }));
  }, [history, t]);
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm" h="100%">
        <SectionTitle
          title={t("Players.RatingHistory", "Rating history")}
          description={t(
            "Players.RatingHistoryHint",
            "Last rating of each month, by time control.",
          )}
        />
        {series.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t("Players.NotEnoughRatings", "Not enough rated months to draw the history.")}
          </Text>
        ) : (
          <LineChart
            h={230}
            data={history}
            dataKey="month"
            series={series}
            curveType="monotone"
            connectNulls
            withDots={history.length < 30}
            withLegend
            legendProps={{ verticalAlign: "bottom", height: 30 }}
            yAxisProps={{ domain: ["dataMin - 30", "dataMax + 30"] }}
            gridAxis="y"
          />
        )}
      </Stack>
    </Paper>
  );
}

function ActivityChart({ games }: { games: ProfileGame[] }) {
  const { t } = useTranslation();
  const months = useMemo(() => activityByMonth(games), [games]);
  const [scale, setScale] = useState<"auto" | "month" | "year">("auto");
  const byYear = scale === "year" || (scale === "auto" && months.length > 36);
  const data = useMemo(() => {
    if (!byYear) return months.map((value) => ({ period: value.month, games: value.games }));
    const years = new Map<string, number>();
    for (const value of months) {
      const year = value.month.slice(0, 4);
      years.set(year, (years.get(year) ?? 0) + value.games);
    }
    return [...years.entries()].map(([period, count]) => ({ period, games: count }));
  }, [byYear, months]);
  if (months.length === 0) return null;
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <SectionTitle
          title={t("Players.Activity", "Activity")}
          description={t("Players.ActivityHint", "Games played in each period.")}
          right={
            <SegmentedControl
              size="xs"
              value={byYear ? "year" : "month"}
              onChange={(value) => setScale(value as "month" | "year")}
              data={[
                { value: "month", label: t("Players.ByMonth", "Months") },
                { value: "year", label: t("Players.ByYear", "Years") },
              ]}
            />
          }
        />
        <BarChart
          h={180}
          data={data}
          dataKey="period"
          series={[{ name: "games", label: t("Players.Games", "Games"), color: "blue.6" }]}
          gridAxis="y"
          barProps={{ radius: 3 }}
        />
      </Stack>
    </Paper>
  );
}
