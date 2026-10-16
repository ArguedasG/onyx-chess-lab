import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowBackUp,
  IconBulb,
  IconChessKnight,
  IconHome,
  IconSitemap,
  IconWand,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chessground } from "@/chessground/Chessground";
import {
  type BookMove,
  bookPosition,
  lineFens,
  lineSan,
  type PlayerBook,
  type PlayerBooks,
  playerPar,
} from "@/utils/preparation/book";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { ResultBar } from "../common";
import { formatScore } from "../labels";
import { EmptyState, SectionHeader, signed } from "./common";
import { colorName } from "./labels";

/** A move first played in the last 90 days of the book, while older games went elsewhere. */
const NEW_DAYS = 90;

function daysBetween(from: string, to: string) {
  const a = new Date(`${from.length === 7 ? `${from}-01` : from}T00:00:00`).getTime();
  const b = new Date(`${to.length === 7 ? `${to}-01` : to}T00:00:00`).getTime();
  return (b - a) / 86_400_000;
}

function latestDay(book: PlayerBook): string | null {
  let latest: string | null = null;
  for (const position of book.positions.values())
    for (const move of position.moves)
      if (move.lastDay && (!latest || move.lastDay > latest)) latest = move.lastDay;
  return latest;
}

export type LineAction = (moves: string[], color: GeneratorColor) => void;

/**
 * The likely repertoire as a move tree (the rival's games with one color): every move with its
 * games, the player's score and rating par, and a mark on recent deviations. From any position
 * the line opens on the board, in the generator or in the surprise finder.
 */
export default function BookExplorer({
  books,
  name,
  isSelf,
  onOpenLine,
  onGenerate,
  onSurprises,
}: {
  books: PlayerBooks;
  name: string;
  isSelf: boolean;
  onOpenLine: (moves: string[]) => void;
  onGenerate: LineAction;
  onSurprises: LineAction;
}) {
  const { t } = useTranslation();
  const [color, setColor] = useState<GeneratorColor>(
    books.white.games >= books.black.games ? "white" : "black",
  );
  const [path, setPath] = useState<string[]>([]);
  const book = books[color];
  const fens = useMemo(() => lineFens(path), [path]);
  const fen = fens.at(-1)!;
  const position = bookPosition(book, fen);
  const latest = useMemo(() => latestDay(book), [book]);
  const total = position?.moves.reduce((sum, move) => sum + move.games, 0) ?? 0;
  // The user's side: the other color for a rival, the same one for the own card.
  const userColor: GeneratorColor = isSelf ? color : color === "white" ? "black" : "white";

  const isNew = (move: BookMove) =>
    Boolean(
      latest &&
      move.firstDay &&
      daysBetween(move.firstDay, latest) <= NEW_DAYS &&
      total - move.games >= 3,
    );

  const breadcrumbs = useMemo(() => {
    const san = lineSan(path).split(" ").filter(Boolean);
    return san.map((label, index) => ({ label, index }));
  }, [path]);

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconSitemap size={18} />}
        title={t("Preparation.Book.Title", "Likely repertoire")}
        description={t(
          "Preparation.Book.Description",
          "The moves of {{name}}'s games with each color, with the score and rating par of {{name}} after each one. Badges mark recent deviations.",
          { name },
        )}
        right={
          <SegmentedControl
            size="xs"
            value={color}
            onChange={(value) => {
              setColor(value as GeneratorColor);
              setPath([]);
            }}
            data={[
              {
                value: "white",
                label: t("Preparation.Book.WithColor", "With {{color}} · {{count}}", {
                  color: colorName("white", t).toLowerCase(),
                  count: books.white.games,
                }),
              },
              {
                value: "black",
                label: t("Preparation.Book.WithColor", "With {{color}} · {{count}}", {
                  color: colorName("black", t).toLowerCase(),
                  count: books.black.games,
                }),
              },
            ]}
          />
        }
      />

      {book.games === 0 ? (
        <EmptyState>
          {t("Preparation.Book.Empty", "No games with this color in the current filters.")}
        </EmptyState>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Box style={{ aspectRatio: "1 / 1", width: "100%", maxWidth: 420, margin: "0 auto" }}>
                <Chessground fen={fen} coordinates={false} viewOnly orientation={userColor} />
              </Box>
              <Group gap={4} wrap="wrap">
                <Tooltip label={t("Preparation.Book.Start", "Start position")}>
                  <ActionIcon variant="subtle" size="sm" onClick={() => setPath([])}>
                    <IconHome size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={t("Preparation.Book.Back", "One move back")}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    disabled={path.length === 0}
                    onClick={() => setPath((previous) => previous.slice(0, -1))}
                  >
                    <IconArrowBackUp size={14} />
                  </ActionIcon>
                </Tooltip>
                {breadcrumbs.map((crumb) => (
                  <UnstyledButton
                    key={crumb.index}
                    onClick={() => setPath((previous) => previous.slice(0, crumb.index + 1))}
                  >
                    <Text
                      size="sm"
                      ff="monospace"
                      c={crumb.index === path.length - 1 ? undefined : "dimmed"}
                    >
                      {crumb.label}
                    </Text>
                  </UnstyledButton>
                ))}
              </Group>
              <Group gap="xs" wrap="wrap">
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconChessKnight size={14} />}
                  onClick={() => onOpenLine(path)}
                >
                  {t("Preparation.OpenBoard", "Open on the board")}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconWand size={14} />}
                  onClick={() => onGenerate(path, userColor)}
                >
                  {t("Preparation.Book.Generate", "Prepare lines from here")}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="grape"
                  leftSection={<IconBulb size={14} />}
                  onClick={() => onSurprises(path, userColor)}
                >
                  {t("Preparation.Book.Surprises", "Surprises in this line")}
                </Button>
              </Group>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md" style={{ display: "flex", flexDirection: "column" }}>
            <Group justify="space-between" mb="xs">
              <Text fw={700}>
                {position && position.moves.length > 0
                  ? t("Preparation.Book.MovesHere", "Moves here")
                  : t("Preparation.Book.OutOfBook", "Out of the games")}
              </Text>
              <Text size="xs" c="dimmed">
                {t("Players.GamesCount", "{{count}} games", { count: position?.games ?? 0 })}
              </Text>
            </Group>
            {!position || position.moves.length === 0 ? (
              <Text size="sm" c="dimmed">
                {t(
                  "Preparation.Book.NoMoves",
                  "No game of the filters continues from here (the book reads the first ten moves).",
                )}
              </Text>
            ) : (
              <ScrollArea.Autosize mah={460} offsetScrollbars>
                <Stack gap={4}>
                  {position.moves.map((move) => {
                    const share = total ? (move.games / total) * 100 : 0;
                    const par = playerPar(book, fen, move);
                    const known = move.white + move.draws + move.black;
                    const wins = color === "white" ? move.white : move.black;
                    const losses = color === "white" ? move.black : move.white;
                    return (
                      <UnstyledButton
                        key={move.uci}
                        onClick={() => setPath((previous) => [...previous, move.uci])}
                        style={{
                          borderRadius: 8,
                          padding: "6px 8px",
                          border: "1px solid var(--mantine-color-default-border)",
                        }}
                      >
                        <Group justify="space-between" wrap="nowrap" gap="sm">
                          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                            <Text fw={700} ff="monospace" w={64}>
                              {move.san}
                            </Text>
                            {isNew(move) && (
                              <Tooltip
                                label={t(
                                  "Preparation.Book.NewHint",
                                  "First played on {{date}}, in the last three months of these games.",
                                  { date: move.firstDay },
                                )}
                              >
                                <Badge size="xs" color="grape" variant="light">
                                  {t("Preparation.Book.New", "New")}
                                </Badge>
                              </Tooltip>
                            )}
                            <Box w={90}>
                              <Progress value={share} size="sm" radius="xl" />
                            </Box>
                            <Text size="xs" c="dimmed" w={70}>
                              {`${share.toFixed(0)}% · ${move.games}`}
                            </Text>
                          </Group>
                          <Group gap="sm" wrap="nowrap">
                            <Box w={70}>
                              <ResultBar wins={wins} draws={move.draws} losses={losses} size="xs" />
                            </Box>
                            <Text size="xs" w={48} ta="right">
                              {formatScore(known ? ((wins + move.draws / 2) / known) * 100 : null)}
                            </Text>
                            <Tooltip
                              label={t(
                                "Preparation.Book.ParHint",
                                "Score of {{name}} minus the one the ratings predict, in {{count}} rated games.",
                                { name, count: move.ratedGames ?? 0 },
                              )}
                            >
                              <Text
                                size="xs"
                                w={44}
                                ta="right"
                                c={
                                  (move.ratedGames ?? 0) < 10 || par == null
                                    ? "dimmed"
                                    : par <= -5
                                      ? "orange"
                                      : par >= 5
                                        ? "teal"
                                        : undefined
                                }
                              >
                                {signed(par)}
                              </Text>
                            </Tooltip>
                          </Group>
                        </Group>
                      </UnstyledButton>
                    );
                  })}
                </Stack>
              </ScrollArea.Autosize>
            )}
            <Text size="xs" c="dimmed" mt="xs">
              {t(
                "Preparation.Book.Legend",
                "Bar: share of the games. Then wins, draws and losses of {{name}}, score and rating par.",
                { name },
              )}
            </Text>
          </Paper>
        </SimpleGrid>
      )}
    </Stack>
  );
}
