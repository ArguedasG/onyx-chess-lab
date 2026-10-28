import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconClockHour4, IconPlayerStop, IconScale } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, events, type TraitDeviation } from "@/bindings";
import { useRhythmLabel } from "@/components/boards/RatedGameSelector";
import { twinStylesAtom, type TwinStyleRecord } from "@/state/twinBots";
import { clampMaiaElo } from "@/utils/humanBots";
import {
  binPercentile,
  MIN_THINK_MOVES,
  splitForFidelity,
  TWIN_RHYTHMS,
  twinThinking,
} from "@/utils/preparation/twin";
import { chronological, type ProfileGame } from "@/utils/players/profileGames";
import { unwrap } from "@/utils/unwrap";
import { usePreparationEngines } from "./common";

/** Positions measured with Maia: about a minute or two with the managed Maia 3. */
const STYLE_POSITIONS = 400;
/** Games read for the style, most recent first. */
const STYLE_GAMES = 200;

function seconds(value: number) {
  return value >= 10 ? `${value.toFixed(0)} s` : `${value.toFixed(1)} s`;
}

/** The player's think time by rhythm, which the twin copies (9.3). */
export function TwinThinkingCard({ games, name }: { games: ProfileGame[]; name: string }) {
  const { t } = useTranslation();
  const rhythmLabel = useRhythmLabel();
  const thinking = useMemo(() => twinThinking(games), [games]);
  const rows = TWIN_RHYTHMS.map((rhythm) => ({ rhythm, stats: thinking[rhythm] })).filter(
    (row) => row.stats && row.stats.moves > 0,
  );
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Group gap="xs">
          <IconClockHour4 size={16} />
          <Text fw={700}>{t("Preparation.Twin.Thinking", "Think time")}</Text>
        </Group>
        <Text size="xs" c="dimmed">
          {t(
            "Preparation.Twin.ThinkingHint",
            "The twin thinks as long as {{name}} at the rhythm of the game: their average per move after the first ten, how much faster they play the opening, and their quickest and slowest moves, from the clocks of their games. With too few moves at a rhythm it uses their nearest rhythm; without clocks, the times of the catalogue bots of that rating.",
            { name },
          )}
        </Text>
        {rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t(
              "Preparation.Twin.NoClocks",
              "These games have no clocks (over-the-board games usually do not): the twin will think like a catalogue bot of its rating.",
            )}
          </Text>
        ) : (
          <Table withTableBorder verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Preparation.Twin.Rhythm", "Rhythm")}</Table.Th>
                <Table.Th ta="right">{t("Players.Games", "Games")}</Table.Th>
                <Table.Th ta="right">{t("Preparation.Twin.PerMove", "Per move")}</Table.Th>
                <Table.Th ta="right">{t("Preparation.Twin.Opening", "First ten moves")}</Table.Th>
                <Table.Th ta="right">
                  <Tooltip
                    label={t(
                      "Preparation.Twin.RangeHint",
                      "Quickest 10 % and slowest 5 % of the moves after the first ten.",
                    )}
                  >
                    <span>{t("Preparation.Twin.Range", "Range")}</span>
                  </Tooltip>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ rhythm, stats }) => {
                const enough = stats!.moves >= MIN_THINK_MOVES;
                return (
                  <Table.Tr key={rhythm} c={enough ? undefined : "dimmed"}>
                    <Table.Td>
                      <Group gap={6}>
                        {rhythmLabel(rhythm)}
                        {!enough && (
                          <Tooltip
                            label={t(
                              "Preparation.Twin.FewMoves",
                              "Fewer than {{count}} moves: not used for this rhythm.",
                              { count: MIN_THINK_MOVES },
                            )}
                          >
                            <Badge size="xs" variant="outline" color="gray">
                              {t("Preparation.Twin.Few", "few")}
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">{stats!.games}</Table.Td>
                    <Table.Td ta="right">
                      {stats!.moves > 0 ? seconds(stats!.seconds / stats!.moves) : "—"}
                    </Table.Td>
                    <Table.Td ta="right">
                      {stats!.openingMoves > 0
                        ? seconds(stats!.openingSeconds / stats!.openingMoves)
                        : "—"}
                    </Table.Td>
                    <Table.Td ta="right">
                      {stats!.moves > 0
                        ? `${seconds(binPercentile(stats!.bins, 0.1))} – ${seconds(binPercentile(stats!.bins, 0.95))}`
                        : "—"}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

type StyleRun =
  | { status: "idle" }
  | { status: "running"; progress: number }
  | { status: "error"; message: string };

function axisVerdict(
  deviation: TraitDeviation,
  labels: { more: string; less: string; same: string },
) {
  // Two standard errors: a clear difference with this sample.
  if (Math.abs(deviation.delta) < 2 * deviation.stdError) return labels.same;
  return deviation.delta > 0 ? labels.more : labels.less;
}

function signedWeight(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

/**
 * The player's style against Maia at their rating (9.3): how their moves lean on the two axes of
 * the bots' styles, the weights that predict them best and whether those weights predict their
 * recent games better than Maia alone. Only then does the twin use them.
 */
export function TwinStyleCard({
  games,
  name,
  cardId,
  elo,
}: {
  games: ProfileGame[];
  name: string;
  cardId: string;
  elo: number;
}) {
  const { t } = useTranslation();
  const { maia } = usePreparationEngines();
  const [styles, setStyles] = useAtom(twinStylesAtom);
  const record: TwinStyleRecord | undefined = styles[cardId];
  const [run, setRun] = useState<StyleRun>({ status: "idle" });
  const runId = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (runId.current) void commands.cancelAnalysis(runId.current);
    },
    [],
  );

  async function measure() {
    if (!maia) return;
    const own = chronological(games.filter((game) => !game.customStart))
      .reverse()
      .slice(0, STYLE_GAMES);
    const { test } = splitForFidelity(own);
    const testKeys = new Set(test.map((game) => game.key));
    const id = `twin-style-${cardId}-${Date.now()}`;
    runId.current = id;
    setRun({ status: "running", progress: 0 });
    const unlisten = await events.progressEvent.listen(({ payload }) => {
      if (payload.id === id && !payload.finished)
        setRun({ status: "running", progress: payload.progress });
    });
    try {
      const measurement = unwrap(
        await commands.measurePlayerStyle({
          id,
          games: own.map((game) => ({
            file: game.source.databasePath,
            id: game.id,
            playerWhite: game.isWhite,
            opponentElo: game.opponentElo,
            test: testKeys.has(game.key),
          })),
          maiaPath: maia.path,
          maiaArgs: maia.args ?? [],
          elo: clampMaiaElo(elo),
          maxPositions: STYLE_POSITIONS,
        }),
      );
      if (!measurement.cancelled) {
        setStyles((previous) => ({
          ...previous,
          [cardId]: {
            measuredAt: new Date().toISOString(),
            elo: clampMaiaElo(elo),
            games: own.length,
            measurement,
          },
        }));
      }
      setRun({ status: "idle" });
    } catch (error) {
      setRun({ status: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      unlisten();
      runId.current = null;
    }
  }

  const result = record?.measurement;
  // Geometric mean of the probability of the move played, with the style against without it.
  const gain = result
    ? (Math.exp(result.styled.logLikelihood - result.maia.logLikelihood) - 1) * 100
    : 0;
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={2} style={{ flex: 1, minWidth: 260 }}>
          <Group gap="xs">
            <IconScale size={16} />
            <Text fw={700}>{t("Preparation.Twin.Style", "Style against Maia")}</Text>
            {result && (
              <Badge variant="light" color={result.improves ? "grape" : "gray"}>
                {result.improves
                  ? t("Preparation.Twin.StyleApplied", "The twin uses it")
                  : t("Preparation.Twin.StyleNotApplied", "Not used: no better than Maia")}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {t(
              "Preparation.Twin.StyleHint",
              "In {{name}}'s moves after the opening, how far they lean towards aggressive or simplifying moves compared with what Maia expects at their rating, on the same two axes as the catalogue bots. The weights are fitted on the older games and checked on the most recent ones, which are left out; the twin uses them only if they predict those games better than Maia alone.",
              { name },
            )}
          </Text>
        </Stack>
        {run.status === "running" ? (
          <Button
            variant="default"
            leftSection={<IconPlayerStop size={16} />}
            onClick={() => runId.current && void commands.cancelAnalysis(runId.current)}
          >
            {t("Preparation.Twin.Stop", "Stop")}
          </Button>
        ) : (
          <Button
            variant="light"
            disabled={!maia || games.length < 20}
            onClick={() => void measure()}
          >
            {result
              ? t("Preparation.Twin.Remeasure", "Measure again")
              : t("Preparation.Twin.MeasureStyle", "Measure the style")}
          </Button>
        )}
      </Group>
      {run.status === "running" && <Progress mt="sm" value={run.progress} animated striped />}
      {run.status === "error" && (
        <Alert color="red" mt="sm">
          {run.message}
        </Alert>
      )}
      {!result && run.status === "idle" && (
        <Text size="xs" c="dimmed" mt="sm">
          {games.length < 20
            ? t("Preparation.Twin.StyleFewGames", "It needs at least 20 games.")
            : t(
                "Preparation.Twin.StyleDuration",
                "About {{positions}} positions with Maia: a minute or two.",
                { positions: STYLE_POSITIONS },
              )}
        </Text>
      )}
      {result && (
        <Stack gap="sm" mt="sm">
          <Stack gap={6}>
            {(
              [
                [
                  t("Preparation.Twin.Aggression", "Aggression"),
                  result.aggression,
                  axisVerdict(result.aggression, {
                    more: t("Preparation.Twin.MoreAggressive", "more aggressive than expected"),
                    less: t("Preparation.Twin.LessAggressive", "more defensive than expected"),
                    same: t("Preparation.Twin.AsExpected", "as expected"),
                  }),
                ],
                [
                  t("Preparation.Twin.Simplification", "Simplification"),
                  result.simplification,
                  axisVerdict(result.simplification, {
                    more: t("Preparation.Twin.MoreSimplifying", "simplifies more than expected"),
                    less: t(
                      "Preparation.Twin.MoreComplicating",
                      "keeps more tension than expected",
                    ),
                    same: t("Preparation.Twin.AsExpected", "as expected"),
                  }),
                ],
              ] as const
            ).map(([label, deviation, verdict]) => (
              <Paper key={label} withBorder radius="sm" px="sm" py={6}>
                <Group justify="space-between" gap="xs" wrap="wrap">
                  <Group gap="xs" wrap="wrap">
                    <Text size="sm" fw={600}>
                      {label}
                    </Text>
                    <Badge
                      variant="light"
                      color={Math.abs(deviation.delta) < 2 * deviation.stdError ? "gray" : "grape"}
                      style={{ textTransform: "none" }}
                    >
                      {verdict}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {`${signedWeight(deviation.delta)} ± ${deviation.stdError.toFixed(2)}`}
                  </Text>
                </Group>
              </Paper>
            ))}
          </Stack>
          <Stack gap={4}>
            <Text size="sm">
              {t(
                "Preparation.Twin.Weights",
                "Fitted weights: aggression {{aggression}}, simplification {{simplification}}.",
                {
                  aggression: signedWeight(result.weightsAggression),
                  simplification: signedWeight(result.weightsSimplification),
                },
              )}
            </Text>
            <Text size="sm">
              {t(
                "Preparation.Twin.StyleCheck",
                "Recent games: the move played is the first choice {{styled}}% of the time with the style and {{maia}}% with Maia alone.",
                {
                  styled: (result.styled.top * 100).toFixed(0),
                  maia: (result.maia.top * 100).toFixed(0),
                },
              )}{" "}
              {gain >= 0
                ? t(
                    "Preparation.Twin.StyleGain",
                    "With the style it is on average {{gain}}% more likely.",
                    { gain: gain.toFixed(1) },
                  )
                : t(
                    "Preparation.Twin.StyleLoss",
                    "With the style it is on average {{gain}}% less likely.",
                    { gain: Math.abs(gain).toFixed(1) },
                  )}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "Preparation.Twin.StyleSample",
                "{{train}} positions to fit and {{test}} to check, Maia {{elo}}, {{games}} games, {{date}}. The trait differences are per move, in the units of the bots' style.",
                {
                  train: result.trainPositions,
                  test: result.testPositions,
                  elo: record.elo,
                  games: record.games,
                  date: record.measuredAt.slice(0, 10),
                },
              )}
            </Text>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}
