import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import MaiaRequiredAlert from "@/components/common/MaiaRequiredAlert";
import { IconChessKnight, IconFocus2, IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clampMaiaElo } from "@/utils/humanBots";
import type { PlayerBooks } from "@/utils/preparation/book";
import {
  keyPositionCandidates,
  MIN_OWN_GAMES,
  type RatedKeyPosition,
  rateKeyPositions,
} from "@/utils/preparation/keyPositions";
import { EngineEvaluator, MaiaSampler } from "@/utils/repertoireGenerator/engines";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { DifficultyBadge } from "../../generator/GeneratorResults";
import {
  EmptyState,
  LineText,
  SectionHeader,
  SuggestionNote,
  usePreparationEngines,
} from "./common";
import { colorName } from "./labels";

type Run =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; positions: RatedKeyPosition[]; elo: number; color: GeneratorColor }
  | { status: "error"; message: string };

/**
 * Practical difficulty of the positions the player's most played lines reach (I-33): how likely
 * a player of their level is to keep the evaluation there. For a rival, the lowest values are
 * where it pays to take the game; for the user's own card, what to train first.
 */
export default function KeyPositionsSection({
  books,
  name,
  isSelf,
  defaultElo,
  onOpenLine,
}: {
  books: PlayerBooks;
  name: string;
  isSelf: boolean;
  defaultElo: number;
  onOpenLine: (moves: string[]) => void;
}) {
  const { t } = useTranslation();
  const { reference, maia } = usePreparationEngines();
  const [color, setColor] = useState<GeneratorColor>(
    books.white.games >= books.black.games ? "white" : "black",
  );
  const [elo, setElo] = useState(defaultElo);
  const [run, setRun] = useState<Run>({ status: "idle" });
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  useEffect(() => setElo(defaultElo), [defaultElo]);

  const candidates = useMemo(() => keyPositionCandidates(books[color]), [books, color]);
  const needsMaia = candidates.some((position) => position.games < MIN_OWN_GAMES);

  async function start() {
    if (!reference) return;
    const id = `key-positions-${Date.now()}`;
    const abort = new AbortController();
    const evaluator = new EngineEvaluator(reference, 400, `${id}-engine`);
    const sampler = maia ? new MaiaSampler(maia, clampMaiaElo(elo), `${id}-maia`) : undefined;
    cancel.current = () => {
      abort.abort();
      evaluator.cancel();
      sampler?.cancel();
    };
    setRun({ status: "running", done: 0, total: candidates.length });
    try {
      const positions = await rateKeyPositions(
        candidates,
        { evaluator, maia: sampler, signal: abort.signal },
        (done, total) => setRun({ status: "running", done, total }),
      );
      setRun({ status: "done", positions, elo, color });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRun(
        abort.signal.aborted || message.toLowerCase().includes("cancel")
          ? { status: "idle" }
          : { status: "error", message },
      );
    } finally {
      sampler?.close();
      cancel.current = null;
    }
  }

  const running = run.status === "running";

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconFocus2 size={18} />}
        title={
          isSelf
            ? t("Preparation.Key.TitleSelf", "Where I tend to go wrong")
            : t("Preparation.Key.Title", "Key positions for {{name}}", { name })
        }
        description={
          isSelf
            ? t(
                "Preparation.Key.DescriptionSelf",
                "The positions your most played lines reach with you to move, and the chance that a player of your level keeps the evaluation there. The lowest ones are the first to train.",
              )
            : t(
                "Preparation.Key.Description",
                "The positions {{name}}'s most played lines reach with {{name}} to move, and the chance that a player of that level keeps the evaluation. The lowest ones are where it pays to take the game.",
                { name },
              )
        }
      />
      {!isSelf && <SuggestionNote />}

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
          <Group gap="md" align="flex-end" wrap="wrap">
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                {t("Preparation.Key.Color", "Games of {{name}} with", { name })}
              </Text>
              <SegmentedControl
                size="xs"
                value={color}
                disabled={running}
                onChange={(value) => setColor(value as GeneratorColor)}
                data={(["white", "black"] as const).map((value) => ({
                  value,
                  label: `${colorName(value, t)} · ${books[value].games}`,
                }))}
              />
            </Stack>
            <NumberInput
              label={t("Preparation.Key.Elo", "Level (Maia)")}
              description={t("Preparation.Key.EloHint", "From the latest rating")}
              w={150}
              min={600}
              max={2600}
              step={50}
              value={elo}
              disabled={running}
              onChange={(value) => typeof value === "number" && setElo(value)}
            />
          </Group>
          <Group gap="xs">
            {running ? (
              <Button
                variant="default"
                leftSection={<IconPlayerStop size={16} />}
                onClick={() => cancel.current?.()}
              >
                {t("Common.Cancel", "Cancel")}
              </Button>
            ) : (
              <Button
                leftSection={<IconPlayerPlay size={16} />}
                disabled={!reference || candidates.length === 0}
                onClick={() => void start()}
              >
                {t("Preparation.Key.Run", "Measure {{count}} positions", {
                  count: candidates.length,
                })}
              </Button>
            )}
          </Group>
        </Group>
        {running && (
          <Stack gap={4} mt="sm">
            <Progress value={run.total ? (run.done / run.total) * 100 : 0} animated striped />
            <Text size="xs" c="dimmed">
              {t("Preparation.Key.Running", "Engine and Maia at work…")}
            </Text>
          </Stack>
        )}
      </Paper>

      {!reference && (
        <Alert color="yellow">
          {t("Generator.NoEngine", "Install a reference engine such as Stockfish in Engines.")}
        </Alert>
      )}
      {needsMaia && !maia && (
        <MaiaRequiredAlert color="gray">
          {t(
            "Preparation.Key.NoMaia",
            "Maia 3 is not installed: positions with fewer than {{count}} games of this player are left without a difficulty.",
            { count: MIN_OWN_GAMES },
          )}
        </MaiaRequiredAlert>
      )}
      {run.status === "error" && <Alert color="red">{run.message}</Alert>}

      {candidates.length === 0 ? (
        <EmptyState>
          {t(
            "Preparation.Key.Empty",
            "No position is reached often enough (at least 3 games and 4% of the games with this color).",
          )}
        </EmptyState>
      ) : run.status !== "done" ? (
        <EmptyState>
          {t(
            "Preparation.Key.Idle",
            "Press the button to measure them: Stockfish marks the moves that keep the evaluation and the player's own choices (from {{count}} games in the position) or Maia at the chosen level say how often they are found.",
            { count: MIN_OWN_GAMES },
          )}
        </EmptyState>
      ) : (
        <Paper withBorder radius="md" p={0}>
          <Table striped highlightOnHover verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Preparation.Key.Line", "Line")}</Table.Th>
                <Table.Th ta="right">{t("Players.Games", "Games")}</Table.Th>
                <Table.Th>
                  {isSelf
                    ? t("Preparation.Key.IPlay", "I play")
                    : t("Preparation.Key.TheyPlay", "{{name}} plays", { name })}
                </Table.Th>
                <Table.Th>{t("Preparation.Key.Best", "Engine")}</Table.Th>
                <Table.Th>{t("Preparation.Key.Difficulty", "Keeps the evaluation")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {run.positions.map((position) => (
                <Table.Tr key={position.path.join(" ")}>
                  <Table.Td maw={320}>
                    <LineText moves={position.path} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm">{position.games}</Text>
                    <Text size="xs" c="dimmed">
                      {`${position.reach.toFixed(0)}%`}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {position.moves.slice(0, 3).map((move) => (
                        <Badge key={move.uci} variant="default" size="sm" radius="sm">
                          {`${move.san} ${Math.round((move.games / position.games) * 100)}%`}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {position.bestSan ? (
                      <Tooltip
                        label={t("Preparation.Key.BestHint", "Chosen in {{share}}% of the games", {
                          share: Math.round(position.bestShare ?? 0),
                        })}
                      >
                        <Text size="sm" fw={600} ff="monospace">
                          {position.bestSan}
                        </Text>
                      </Tooltip>
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td>
                    {position.difficulty ? (
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={600} w={40}>
                          {`${Math.round(position.difficulty.keepProbability * 100)}%`}
                        </Text>
                        <DifficultyBadge value={position.difficulty} elo={run.elo} />
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={t("Preparation.OpenBoard", "Open on the board")}>
                      <ActionIcon variant="subtle" onClick={() => onOpenLine(position.path)}>
                        <IconChessKnight size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
