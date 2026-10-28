import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import MaiaRequiredAlert from "@/components/common/MaiaRequiredAlert";
import { IconChartDots, IconPlayerPlay, IconPlayerStop, IconRobot } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  activeTabAtom,
  gameInputColorAtom,
  gamePlayer1SettingsAtom,
  gamePlayer2SettingsAtom,
  tabsAtom,
} from "@/state/atoms";
import { twinBooksAtom, twinStylesAtom } from "@/state/twinBots";
import { clampMaiaElo, DEFAULT_HUMAN_BOT_PROFILE_ID, MAIA_ELO_MIN } from "@/utils/humanBots";
import { type PlayerBooks, loadPlayerBooks } from "@/utils/preparation/book";
import {
  type FidelityResult,
  fidelityPlan,
  measureFidelity,
  splitForFidelity,
  TWIN_ELO_MAX,
  twinRepertoire,
  twinThinking,
} from "@/utils/preparation/twin";
import { chronological, type ProfileGame } from "@/utils/players/profileGames";
import { MaiaSampler } from "@/utils/repertoireGenerator/engines";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { createTab } from "@/utils/tabs";
import { DEFAULT_TIME_CONTROL } from "../../boards/OpponentForm";
import { EmptyState, SectionHeader, usePreparationEngines } from "./common";
import { colorName } from "./labels";
import { TwinStyleCard, TwinThinkingCard } from "./TwinBehaviour";

/** Samples per position when measuring: enough to compare, quick enough for 120 positions. */
const FIDELITY_SAMPLES = 8;

type Measure =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; result: FidelityResult; color: GeneratorColor; elo: number }
  | { status: "error"; message: string };

/**
 * Twin bot, version 1 (I-43): the player's own opening sequences, then Maia at their rating.
 * The fidelity check uses their most recent games, left out of the book.
 */
export default function TwinSection({
  books,
  games,
  name,
  cardId,
  defaultElo,
}: {
  books: PlayerBooks;
  games: ProfileGame[];
  name: string;
  cardId: string;
  defaultElo: number;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { maia } = usePreparationEngines();
  const [color, setColor] = useState<GeneratorColor>(
    books.white.games >= books.black.games ? "white" : "black",
  );
  const [elo, setElo] = useState(defaultElo);
  useEffect(() => setElo(defaultElo), [defaultElo]);
  const [measure, setMeasure] = useState<Measure>({ status: "idle" });
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const setTwinBooks = useSetAtom(twinBooksAtom);
  const style = useAtomValue(twinStylesAtom)[cardId]?.measurement;
  const setPlayer1 = useSetAtom(gamePlayer1SettingsAtom);
  const setPlayer2 = useSetAtom(gamePlayer2SettingsAtom);
  const setInputColor = useSetAtom(gameInputColorAtom);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const book = books[color];

  async function play() {
    if (!maia) return;
    const id = `${cardId}:${color}`;
    setTwinBooks((previous) => ({ ...previous, [id]: twinRepertoire(book.lines, color, id) }));
    const userColor = color === "white" ? "black" : "white";
    setInputColor(userColor);
    setPlayer1({
      type: "human",
      name: t("Preparation.Twin.You", "You"),
      timeControl: DEFAULT_TIME_CONTROL,
      timeUnit: "m",
      incrementUnit: "s",
    });
    setPlayer2({
      type: "humanBot",
      engine: maia,
      profileId: DEFAULT_HUMAN_BOT_PROFILE_ID,
      humanTiming: true,
      timeControl: DEFAULT_TIME_CONTROL,
      timeUnit: "m",
      incrementUnit: "s",
      twin: {
        id,
        name,
        elo: Math.max(MAIA_ELO_MIN, Math.min(TWIN_ELO_MAX, Math.round(elo))),
        games: book.games,
        lines: book.lines.length,
        thinking: twinThinking(games),
        style: style?.improves
          ? { aggression: style.weightsAggression, simplification: style.weightsSimplification }
          : null,
      },
    });
    await createTab({
      tab: { name: t("Preparation.Twin.Name", "Twin of {{name}}", { name }), type: "play" },
      setTabs,
      setActiveTab,
    });
    navigate({ to: "/" });
  }

  async function runFidelity() {
    if (!maia) return;
    // Newest first, so the test games are the most recent ones.
    const own = chronological(
      games.filter((game) => game.isWhite === (color === "white") && !game.customStart),
    ).reverse();
    const { train, test } = splitForFidelity(own);
    if (train.length < 10) return;
    const id = `twin-fidelity-${Date.now()}`;
    const sampler = new MaiaSampler(maia, clampMaiaElo(elo), id, FIDELITY_SAMPLES);
    let cancelled = false;
    cancel.current = () => {
      cancelled = true;
      sampler.cancel();
    };
    setMeasure({ status: "running", done: 0, total: 1 });
    try {
      const [trainBooks, testBooks] = await Promise.all([
        loadPlayerBooks(train),
        loadPlayerBooks(test),
      ]);
      const plan = fidelityPlan(trainBooks[color].lines, testBooks[color].lines, color);
      const result = await measureFidelity(plan, sampler, (done, total) =>
        setMeasure({ status: "running", done, total }),
      );
      if (!cancelled) setMeasure({ status: "done", result, color, elo });
    } catch (error) {
      setMeasure(
        cancelled
          ? { status: "idle" }
          : { status: "error", message: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      sampler.close();
      cancel.current = null;
    }
  }

  const ownGames = games.filter((game) => game.isWhite === (color === "white")).length;
  const result = measure.status === "done" ? measure.result : null;
  const better = result ? result.twin.probability - result.maia.probability : 0;

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconRobot size={18} />}
        title={t("Preparation.Twin.Title", "Play against the twin")}
        description={t(
          "Preparation.Twin.Description",
          "A bot that plays {{name}}'s repertoire (the opening sequences of these games, with their real frequency) and, out of it, like a player of that rating, with {{name}}'s think time and, if it is measured and helps, their style. Above 2600 Stockfish checks its moves, as with the strongest catalogue bots.",
          { name },
        )}
      />

      {!maia && (
        <MaiaRequiredAlert>
          {t(
            "Preparation.Twin.NoMaia",
            "The twin needs Maia 3. Install it from Engines (managed installation).",
          )}
        </MaiaRequiredAlert>
      )}

      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="md" align="flex-end" wrap="wrap">
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                {t("Preparation.Twin.TwinPlays", "The twin plays")}
              </Text>
              <SegmentedControl
                size="xs"
                value={color}
                onChange={(value) => {
                  setColor(value as GeneratorColor);
                  setMeasure({ status: "idle" });
                }}
                data={(["white", "black"] as const).map((value) => ({
                  value,
                  label: `${colorName(value, t)} · ${books[value].games}`,
                }))}
              />
            </Stack>
            <NumberInput
              label={t("Preparation.Twin.Elo", "Rating out of the book")}
              description={t("Preparation.Key.EloHint", "From the latest rating")}
              w={180}
              min={600}
              max={TWIN_ELO_MAX}
              step={50}
              value={elo}
              onChange={(value) => typeof value === "number" && setElo(value)}
            />
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              disabled={!maia || book.games === 0}
              onClick={() => void play()}
            >
              {t("Preparation.Twin.Play", "Play against the twin")}
            </Button>
          </Group>
          <Group gap="xs">
            <Badge variant="light">
              {t("Preparation.Twin.Sequences", "{{count}} sequences", {
                count: book.lines.length,
              })}
            </Badge>
            <Badge variant="light" color="gray">
              {t("Preparation.Twin.BookDepth", "Book: first 10 moves")}
            </Badge>
            <Text size="xs" c="dimmed">
              {t(
                "Preparation.Twin.Honest",
                "Ratings from other sites or over the board do not match Maia's scale exactly: adjust the level if it feels off.",
              )}
            </Text>
          </Group>
        </Stack>
      </Paper>

      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <TwinThinkingCard games={games} name={name} />
        <TwinStyleCard games={games} name={name} cardId={cardId} elo={elo} />
      </SimpleGrid>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Stack gap={2} style={{ flex: 1, minWidth: 260 }}>
            <Group gap="xs">
              <IconChartDots size={16} />
              <Text fw={700}>{t("Preparation.Twin.Fidelity", "How faithful is it?")}</Text>
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "Preparation.Twin.FidelityHint",
                "The most recent 20% of the games are left out of the book. In each of {{name}}'s positions inside the book, how often the twin would play the move really played, against plain Maia at the same rating. Out of the book the twin is Maia, so both match there.",
                { name },
              )}
            </Text>
          </Stack>
          {measure.status === "running" ? (
            <Button
              variant="default"
              leftSection={<IconPlayerStop size={16} />}
              onClick={() => cancel.current?.()}
            >
              {t("Common.Cancel", "Cancel")}
            </Button>
          ) : (
            <Button
              variant="light"
              disabled={!maia || ownGames < 15}
              onClick={() => void runFidelity()}
            >
              {t("Preparation.Twin.Measure", "Measure")}
            </Button>
          )}
        </Group>
        {ownGames < 15 && (
          <Text size="xs" c="dimmed" mt="xs">
            {t("Preparation.Twin.FewGames", "At least 15 games with this color are needed.")}
          </Text>
        )}
        {measure.status === "running" && (
          <Progress
            mt="sm"
            value={measure.total ? (measure.done / measure.total) * 100 : 0}
            animated
            striped
          />
        )}
        {measure.status === "error" && (
          <Alert color="red" mt="sm">
            {measure.message}
          </Alert>
        )}
        {result &&
          (result.sampled === 0 ? (
            <Text size="sm" c="dimmed" mt="sm">
              {t(
                "Preparation.Twin.NoBookPositions",
                "None of the test games stays in the book: the twin plays like Maia from the first move.",
              )}
            </Text>
          ) : (
            <Stack gap="sm" mt="sm">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Table withTableBorder verticalSpacing={4}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th />
                      <Table.Th ta="right">
                        {t("Preparation.Twin.Probability", "Plays the real move")}
                      </Table.Th>
                      <Table.Th ta="right">{t("Preparation.Twin.Top", "First choice")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td fw={600}>{t("Preparation.Twin.TwinRow", "Twin")}</Table.Td>
                      <Table.Td ta="right">{`${result.twin.probability.toFixed(0)}%`}</Table.Td>
                      <Table.Td ta="right">{`${result.twin.top.toFixed(0)}%`}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>
                        {t("Preparation.Twin.MaiaRow", "Maia {{elo}}", {
                          elo: measure.status === "done" ? measure.elo : elo,
                        })}
                      </Table.Td>
                      <Table.Td ta="right">{`${result.maia.probability.toFixed(0)}%`}</Table.Td>
                      <Table.Td ta="right">{`${result.maia.top.toFixed(0)}%`}</Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
                <Stack gap={4}>
                  <Text size="sm">
                    {better >= 5
                      ? t(
                          "Preparation.Twin.Better",
                          "Inside the book the twin reproduces {{name}}'s moves clearly better than plain Maia.",
                          { name },
                        )
                      : better > -5
                        ? t(
                            "Preparation.Twin.Same",
                            "The twin does not improve on plain Maia here: {{name}}'s repertoire is close to what that rating usually plays, or too varied.",
                            { name },
                          )
                        : t(
                            "Preparation.Twin.Worse",
                            "The book reproduces these games worse than Maia: the recent games depart from the older ones.",
                          )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(
                      "Preparation.Twin.Sample",
                      "{{positions}} positions in the book ({{sampled}} measured, {{samples}} Maia samples each), {{out}} moves out of the book; book from {{train}} games, test with {{test}}.",
                      {
                        positions: result.positions,
                        sampled: result.sampled,
                        samples: FIDELITY_SAMPLES,
                        out: result.outOfBook,
                        train: result.trainGames,
                        test: result.testGames,
                      },
                    )}
                  </Text>
                </Stack>
              </SimpleGrid>
            </Stack>
          ))}
      </Paper>

      {book.games === 0 && (
        <EmptyState>
          {t("Preparation.Book.Empty", "No games with this color in the current filters.")}
        </EmptyState>
      )}
    </Stack>
  );
}
