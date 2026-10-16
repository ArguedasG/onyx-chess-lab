import { LineChart } from "@mantine/charts";
import {
  ActionIcon,
  Alert,
  Group,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChessKnight, IconDroplet, IconPlayerPlay } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type LeakCategory, leakCatalogue, leakTrend } from "@/utils/mistakes/leaks";
import type { PlayerAnalysisCriticalPosition, PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import type { ProfileGame } from "@/utils/players/profileGames";
import { EngineAnalysisButton, EngineBadge } from "../common";
import { EmptyState, SectionHeader } from "../preparation/common";
import { categoryName, categoryRule } from "./labels";

const TREND_COLORS = ["red.6", "orange.6", "grape.6", "blue.6"];

/**
 * Catalogue of leaks (I-29): the errors of the analyzed games by category, the costliest first,
 * with the games they turned into losses and their evolution by quarter.
 */
export default function LeaksSection({
  engine,
  games,
  onReviewCategory,
  onOpenExample,
}: {
  engine: PlayerEngineAnalysis | null;
  games: ProfileGame[];
  onReviewCategory: (category: LeakCategory) => void;
  onOpenExample: (critical: PlayerAnalysisCriticalPosition) => void;
}) {
  const { t } = useTranslation();
  const keys = useMemo(() => new Set(games.map((game) => game.key)), [games]);
  const outcomes = useMemo(() => new Map(games.map((game) => [game.key, game.outcome])), [games]);
  const dates = useMemo(() => new Map(games.map((game) => [game.key, game.day])), [games]);
  const catalogue = useMemo(
    () => (engine ? leakCatalogue(engine, keys, outcomes) : null),
    [engine, keys, outcomes],
  );
  const top = useMemo(
    () =>
      (catalogue?.rows ?? [])
        .filter((row) => row.category !== "unclassified")
        .slice(0, 4)
        .map((row) => row.category),
    [catalogue],
  );
  const trend = useMemo(
    () => (engine ? leakTrend(engine, keys, dates, top) : []),
    [dates, engine, keys, top],
  );
  const totalCost = catalogue?.rows.reduce((sum, row) => sum + row.cost, 0) ?? 0;

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconDroplet size={18} />}
        title={t("Leaks.Title", "Leaks")}
        description={t(
          "Leaks.Description",
          "The mistakes and blunders of the analyzed games, each in the most specific category whose rule holds, the costliest first. What no rule can check stays unclassified.",
        )}
        right={catalogue ? <EngineBadge games={catalogue.analyzedGames} /> : undefined}
      />
      {!catalogue || catalogue.analyzedGames === 0 ? (
        <EmptyState>
          <Stack gap="xs">
            <span>
              {t(
                "Leaks.NeedsEngine",
                "Leaks need an engine analysis of the games in these filters.",
              )}
            </span>
            <EngineAnalysisButton />
          </Stack>
        </EmptyState>
      ) : (
        <>
          {catalogue.missingData > 0 && (
            <Alert color="gray" py={8}>
              {t(
                "Leaks.MissingData",
                "{{count}} errors come from analyses made before this version, without the winning chances before the move or the clock: some categories cannot be checked for them. Analyze the sample again (the cache makes it quick).",
                { count: catalogue.missingData },
              )}
            </Alert>
          )}
          <Paper withBorder radius="md" p={0}>
            <Table striped highlightOnHover verticalSpacing={6}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Mistakes.Category", "Category")}</Table.Th>
                  <Table.Th ta="right">{t("Leaks.Errors", "Errors")}</Table.Th>
                  <Table.Th>
                    <Tooltip
                      multiline
                      w={280}
                      label={t(
                        "Leaks.CostHint",
                        "Points of winning chances given away in total, and per analyzed game.",
                      )}
                    >
                      <span style={{ cursor: "help" }}>{t("Leaks.Cost", "Cost")}</span>
                    </Tooltip>
                  </Table.Th>
                  <Table.Th ta="right">
                    <Tooltip
                      multiline
                      w={280}
                      label={t(
                        "Leaks.TurnedHint",
                        "Lost games with an error of this category made from 40% winning chances or more.",
                      )}
                    >
                      <span style={{ cursor: "help" }}>{t("Leaks.Turned", "Lost games")}</span>
                    </Tooltip>
                  </Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {catalogue.rows.map((row) => (
                  <Table.Tr key={row.category}>
                    <Table.Td>
                      <Tooltip multiline w={300} label={categoryRule(row.category, t)}>
                        <Text size="sm" fw={600} style={{ cursor: "help" }}>
                          {categoryName(row.category, t)}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td ta="right">{row.errors}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Progress
                          w={90}
                          size="sm"
                          color={row.category === "unclassified" ? "gray" : "red"}
                          value={totalCost ? (row.cost / totalCost) * 100 : 0}
                        />
                        <Text size="xs" style={{ whiteSpace: "nowrap" }}>
                          {`${Math.round(row.cost)} · ${(row.cost / catalogue.analyzedGames).toFixed(1)}`}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">{row.turnedLosses}</Table.Td>
                    <Table.Td>
                      <Group gap={2} justify="flex-end" wrap="nowrap">
                        <Tooltip label={t("Leaks.Review", "Review these in My mistakes")}>
                          <ActionIcon
                            variant="subtle"
                            onClick={() => onReviewCategory(row.category)}
                          >
                            <IconPlayerPlay size={15} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t("Leaks.Example", "Open the costliest example")}>
                          <ActionIcon
                            variant="subtle"
                            onClick={() => onOpenExample(row.examples[0])}
                          >
                            <IconChessKnight size={15} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
          <Text size="xs" c="dimmed">
            {t(
              "Leaks.Sample",
              "{{games}} analyzed games, {{moves}} moves of the player. No comparison with other players: Onyx has no reference games with the same time control, level and engine settings, and without them the comparison would mislead.",
              { games: catalogue.analyzedGames, moves: catalogue.playerMoves },
            )}
          </Text>

          <Paper withBorder radius="md" p="md">
            <Text fw={700} mb={4}>
              {t("Leaks.Trend", "Evolution by quarter")}
            </Text>
            <Text size="xs" c="dimmed" mb="sm">
              {t(
                "Leaks.TrendHint",
                "Errors of the four costliest categories per 100 moves; quarters with fewer than 100 analyzed moves are left out.",
              )}
            </Text>
            {trend.length < 2 ? (
              <Text size="sm" c="dimmed">
                {t(
                  "Leaks.TrendEmpty",
                  "It needs analyzed games in at least two quarters. Analyze games from different periods to see it.",
                )}
              </Text>
            ) : (
              <LineChart
                h={220}
                data={trend}
                dataKey="quarter"
                series={top.map((category, index) => ({
                  name: category,
                  label: categoryName(category, t),
                  color: TREND_COLORS[index],
                }))}
                curveType="monotone"
                withLegend
                legendProps={{ verticalAlign: "bottom", height: 30 }}
                gridAxis="y"
              />
            )}
          </Paper>
        </>
      )}
    </Stack>
  );
}
