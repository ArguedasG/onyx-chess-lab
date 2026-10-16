import { BarChart } from "@mantine/charts";
import {
  Anchor,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FAST_MOVE_FROM,
  FAST_MOVE_SECONDS,
  PLAYER_MOVE_RANGES,
  type PlayerEngineAnalysis,
  type PlayerMoveErrors,
} from "@/utils/playerAnalysis";
import {
  type EndingCounts,
  endings,
  engineHabits,
  errorRate,
  MIN_HABIT_GAMES,
  MIN_RATE_MOVES,
  PROBABLE_TIME_LOSS_SECONDS,
  resultsAfterResult,
  standoutRange,
} from "@/utils/players/habits";
import type { ProfileGame } from "@/utils/players/profileGames";
import type { ResultBucket } from "@/utils/players/results";
import {
  EngineAnalysisButton,
  EngineBadge,
  formatDay,
  RatingParValue,
  SectionTitle,
} from "../common";
import { formatScore } from "../labels";

const rangeLabel = ([from, to]: readonly [number, number | null]) =>
  to ? `${from}–${to}` : `${from}+`;

function formatRate(value: PlayerMoveErrors) {
  const rate = errorRate(value);
  return rate == null ? "—" : rate.toFixed(1);
}

/** Psychology, clock and error ranges (I-44): descriptions with their sample, never a diagnosis. */
export default function HabitsSection({
  games,
  engine,
  onOpenGame,
}: {
  games: ProfileGame[];
  engine: PlayerEngineAnalysis | null;
  onOpenGame: (game: ProfileGame, ply?: number | null) => void;
}) {
  const { t } = useTranslation();
  const after = useMemo(() => resultsAfterResult(games), [games]);
  const lossEndings = useMemo(() => endings(games, "loss"), [games]);
  const winEndings = useMemo(() => endings(games, "win"), [games]);
  const habits = useMemo(() => engineHabits(engine, games), [engine, games]);

  const afterRows: Array<{ key: string; label: string; bucket: ResultBucket }> = [
    { key: "overall", label: t("Players.Habits.Overall", "All games"), bucket: after.overall },
    {
      key: "afterLoss",
      label: t("Players.Habits.AfterLoss", "After a loss"),
      bucket: after.afterLoss,
    },
    { key: "afterWin", label: t("Players.Habits.AfterWin", "After a win"), bucket: after.afterWin },
    {
      key: "afterDraw",
      label: t("Players.Habits.AfterDraw", "After a draw"),
      bucket: after.afterDraw,
    },
  ];
  const lossGap =
    after.afterLoss.games >= MIN_HABIT_GAMES &&
    after.afterLoss.scorePercent != null &&
    after.overall.scorePercent != null
      ? after.afterLoss.scorePercent - after.overall.scorePercent
      : null;

  return (
    <Stack gap="sm">
      <SectionTitle
        title={t("Players.Habits.Title", "Habits, clock and errors")}
        description={t(
          "Players.Habits.Description",
          "Descriptions of the games with their sample; they do not explain why something happens.",
        )}
      />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Paper withBorder radius="md" p="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {t("Players.Habits.NextGame", "Next game of the same day")}
            </Text>
            <Table verticalSpacing={4} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th />
                  <Table.Th ta="right">{t("Players.Games", "Games")}</Table.Th>
                  <Table.Th ta="right">{t("Players.Score", "Score")}</Table.Th>
                  <Table.Th ta="right">{t("RatingPar.Column", "vs. expected")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {afterRows.map((row) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>{row.label}</Table.Td>
                    <Table.Td ta="right">{row.bucket.games}</Table.Td>
                    <Table.Td
                      ta="right"
                      c={row.bucket.games < MIN_HABIT_GAMES ? "dimmed" : undefined}
                    >
                      {formatScore(row.bucket.scorePercent)}
                    </Table.Td>
                    <Table.Td ta="right">
                      <RatingParValue par={row.bucket} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed">
              {lossGap == null
                ? t(
                    "Players.Habits.NextGameSmall",
                    "Fewer than {{count}} games after a loss on the same day: not enough to compare.",
                    { count: MIN_HABIT_GAMES },
                  )
                : Math.abs(lossGap) < 3
                  ? t(
                      "Players.Habits.NextGameSame",
                      "After a loss the next game scores about the same as usual.",
                    )
                  : lossGap < 0
                    ? t(
                        "Players.Habits.NextGameLower",
                        "After a loss the next game scores {{gap}} points lower than usual ({{games}} games).",
                        { gap: Math.abs(lossGap).toFixed(1), games: after.afterLoss.games },
                      )
                    : t(
                        "Players.Habits.NextGameHigher",
                        "After a loss the next game scores {{gap}} points higher than usual ({{games}} games).",
                        { gap: lossGap.toFixed(1), games: after.afterLoss.games },
                      )}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <EndingBar
              title={t("Players.Habits.LossEndings", "How the losses end")}
              counts={lossEndings}
            />
            <EndingBar
              title={t("Players.Habits.WinEndings", "How the wins end")}
              counts={winEndings}
            />
            <Text size="xs" c="dimmed">
              {t(
                "Players.Habits.EndingsScope",
                "The database does not store how a game ended. A loss with the loser to move, no mate and {{seconds}} s or less on their last clock reads as a probable time loss; only games with clocks can show it.",
                { seconds: PROBABLE_TIME_LOSS_SECONDS },
              )}
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      {habits ? (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
          <Paper withBorder radius="md" p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={600} size="sm">
                  {t("Players.Habits.Ranges", "Mistakes and blunders by move")}
                </Text>
                <EngineBadge games={habits.moveRanges?.games ?? 0} />
              </Group>
              {habits.moveRanges ? (
                <MoveRanges ranges={habits.moveRanges.ranges} />
              ) : (
                <RecalculateNote />
              )}
            </Stack>
          </Paper>
          <Paper withBorder radius="md" p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={600} size="sm">
                  {t("Players.Habits.Clock", "Errors and the clock")}
                </Text>
                <EngineBadge games={habits.clockBands?.games ?? 0} />
              </Group>
              {habits.clockBands || habits.fastMoves ? (
                <Table verticalSpacing={4} fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th />
                      <Table.Th ta="right">{t("PlayerAnalysis.Moves", "Moves")}</Table.Th>
                      <Table.Th ta="right">
                        {t("Players.Habits.ErrorsPer100", "Errors / 100 moves")}
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {habits.clockBands &&
                      (["high", "middle", "low"] as const).map((band) => (
                        <RateRow
                          key={band}
                          label={
                            {
                              high: t(
                                "Players.Habits.ClockHigh",
                                "More than a third of the base time",
                              ),
                              middle: t("Players.Habits.ClockMiddle", "Between 10 % and a third"),
                              low: t("Players.Habits.ClockLow", "Under 10 % of the base time"),
                            }[band]
                          }
                          value={habits.clockBands!.bands[band]}
                        />
                      ))}
                    {habits.fastMoves && (
                      <>
                        <RateRow
                          label={t("Players.Habits.Fast", "Moves in {{seconds}} s or less", {
                            seconds: FAST_MOVE_SECONDS,
                          })}
                          value={habits.fastMoves.fast}
                        />
                        <RateRow
                          label={t("Players.Habits.Slow", "Slower moves")}
                          value={habits.fastMoves.other}
                        />
                      </>
                    )}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text size="xs" c="dimmed">
                  {t(
                    "Players.Habits.NoClocks",
                    "The analyzed games have no clock data ([%clk]) or no known base time.",
                  )}
                </Text>
              )}
              <Text size="xs" c="dimmed">
                {t(
                  "Players.Habits.ClockScope",
                  "Clock before each move as a share of the base time. Fast moves are measured from move {{from}} on, only with base+increment time controls.",
                  { from: FAST_MOVE_FROM },
                )}
              </Text>
            </Stack>
          </Paper>
          {habits.notLostLosses && (
            <Paper withBorder radius="md" p="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600} size="sm">
                    {t("Players.Habits.NotLost", "Losses in positions that were not lost")}
                  </Text>
                  <EngineBadge games={habits.analyzedGames} />
                </Group>
                <Text size="sm">
                  {t(
                    "Players.Habits.NotLostValue",
                    "{{count}} of {{losses}} analyzed losses without mate or probable time loss ended with the engine at −1.5 or better.",
                    {
                      count: habits.notLostLosses.notLost.length,
                      losses: habits.notLostLosses.losses,
                    },
                  )}
                </Text>
                <Group gap="xs">
                  {habits.notLostLosses.notLost.slice(0, 6).map((game) => (
                    <Anchor key={game.key} size="xs" onClick={() => onOpenGame(game)}>
                      {game.opponent} · {formatDay(game.day)}
                    </Anchor>
                  ))}
                </Group>
              </Stack>
            </Paper>
          )}
        </SimpleGrid>
      ) : (
        <Paper withBorder radius="md" p="md" style={{ borderStyle: "dashed" }}>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              {t(
                "Players.Habits.EngineMissing",
                "Errors by move range, errors with little clock, fast moves and losses in positions that were not lost need an engine analysis of the games (Analysis tab).",
              )}
            </Text>
            <EngineAnalysisButton />
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

function RecalculateNote() {
  const { t } = useTranslation();
  return (
    <Text size="xs" c="dimmed">
      {t(
        "Players.Habits.Reanalyze",
        "Analyses made before this version do not have it: analyze the sample again (the cache makes it quick).",
      )}
    </Text>
  );
}

function RateRow({ label, value }: { label: string; value: PlayerMoveErrors }) {
  return (
    <Table.Tr>
      <Table.Td>{label}</Table.Td>
      <Table.Td ta="right">{value.moves}</Table.Td>
      <Table.Td ta="right" c={value.moves < MIN_RATE_MOVES ? "dimmed" : undefined} fw={600}>
        {formatRate(value)}
      </Table.Td>
    </Table.Tr>
  );
}

function MoveRanges({ ranges }: { ranges: PlayerMoveErrors[] }) {
  const { t } = useTranslation();
  const standout = standoutRange(ranges);
  const data = PLAYER_MOVE_RANGES.map((range, index) => ({
    range: rangeLabel(range),
    rate: Number((errorRate(ranges[index] ?? { moves: 0, errors: 0 }) ?? 0).toFixed(2)),
  }));
  return (
    <>
      <BarChart
        h={160}
        data={data}
        dataKey="range"
        series={[
          {
            name: "rate",
            label: t("Players.Habits.ErrorsPer100", "Errors / 100 moves"),
            color: "red.5",
          },
        ]}
        gridAxis="y"
        barProps={{ radius: 3 }}
      />
      <Text size="xs" c="dimmed">
        {standout
          ? t(
              "Players.Habits.RangeStandout",
              "Errors concentrate in moves {{range}}: {{rate}} per 100 moves against {{overall}} overall.",
              {
                range: rangeLabel(PLAYER_MOVE_RANGES[standout.index]),
                rate: standout.rate.toFixed(1),
                overall: standout.overall.toFixed(1),
              },
            )
          : t("Players.Habits.RangeEven", "No move range stands out from the rest.")}
      </Text>
    </>
  );
}

function EndingBar({ title, counts }: { title: string; counts: EndingCounts }) {
  const { t } = useTranslation();
  const parts = [
    {
      key: "checkmate",
      value: counts.checkmate,
      color: "grape.5",
      label: t("Players.Habits.Mate", "Checkmate"),
    },
    {
      key: "time",
      value: counts.probableTime,
      color: "orange.5",
      label: t("Players.Habits.Time", "Probably on time"),
    },
    {
      key: "other",
      value: counts.other,
      color: "gray.5",
      label: t("Players.Habits.Other", "Resignation or other"),
    },
  ];
  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {t("Players.Habits.WithClock", "{{count}} of {{total}} with clocks", {
            count: counts.withClock,
            total: counts.total,
          })}
        </Text>
      </Group>
      {counts.total > 0 && (
        <Progress.Root size="lg" radius="xl">
          {parts.map((part) => (
            <Tooltip key={part.key} label={`${part.label}: ${part.value}`} withArrow>
              <Progress.Section value={(part.value / counts.total) * 100} color={part.color} />
            </Tooltip>
          ))}
        </Progress.Root>
      )}
      <Group gap="md">
        {parts.map((part) => (
          <Group key={part.key} gap={6}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: `var(--mantine-color-${part.color.replace(".", "-")})`,
              }}
            />
            <Text size="xs">
              {part.label} · {part.value}
            </Text>
          </Group>
        ))}
      </Group>
    </Stack>
  );
}
