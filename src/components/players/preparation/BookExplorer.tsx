import {
  ActionIcon,
  Box,
  Button,
  Group,
  Paper,
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
import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { makeUci, type NormalMove, parseSquare } from "chessops";
import { chessgroundDests } from "chessops/compat";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chessground } from "@/chessground/Chessground";
import { positionFromFen } from "@/utils/chessops";
import {
  type BookMove,
  bookPosition,
  lineFens,
  lineSan,
  movesInBook,
  type PlayerBooks,
} from "@/utils/preparation/book";
import { playUci, sideToMove } from "@/utils/repertoireGenerator/positions";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import BookMovesList from "./BookMovesList";
import { EmptyState, SectionHeader } from "./common";
import { colorName } from "./labels";

/** Arrows for the most played moves of a position, thicker the more they were played. */
function bookShapes(moves: readonly BookMove[], total: number): DrawShape[] {
  return moves
    .filter((move) => total > 0 && move.games / total >= 0.1)
    .slice(0, 3)
    .map((move, index) => ({
      orig: move.uci.slice(0, 2) as Key,
      dest: move.uci.slice(2, 4) as Key,
      brush: index === 0 ? "blue" : "paleBlue",
      modifiers: { lineWidth: Math.round(4 + (move.games / total) * 10) },
    }));
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
  const total = position?.moves.reduce((sum, move) => sum + move.games, 0) ?? 0;
  // The user's side: the other color for a rival, the same one for the own card.
  const userColor: GeneratorColor = isSelf ? color : color === "white" ? "black" : "white";
  const inBook = useMemo(() => movesInBook(book, path), [book, path]);
  const turn = sideToMove(fen);
  const dests = useMemo(() => {
    const [chess] = positionFromFen(fen);
    return chess ? chessgroundDests(chess) : new Map();
  }, [fen]);
  const lastUci = path.at(-1);
  const shapes = useMemo(() => bookShapes(position?.moves ?? [], total), [position, total]);

  // Any legal move can be tried, also ones the player never met.
  function play(orig: string, dest: string) {
    const from = parseSquare(orig);
    const to = parseSquare(dest);
    const [chess] = positionFromFen(fen);
    if (from === undefined || to === undefined || !chess) return;
    const move: NormalMove = { from, to };
    // Promotions become a queen, as most of them are.
    if (chess.board.get(from)?.role === "pawn" && (to >> 3 === 7 || to >> 3 === 0))
      move.promotion = "queen";
    const next = playUci(fen, makeUci(move));
    if (next) setPath((previous) => [...previous, next.uci]);
  }

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
          "The moves of {{name}}'s games with each color, with the score and rating par of {{name}} after each one. Badges mark recent deviations. Move the pieces to try any line, also outside the games.",
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
                <Chessground
                  fen={fen}
                  coordinates={false}
                  orientation={userColor}
                  turnColor={turn}
                  lastMove={lastUci ? [lastUci.slice(0, 2) as Key, lastUci.slice(2, 4) as Key] : []}
                  movable={{
                    free: false,
                    color: turn,
                    dests,
                    showDests: true,
                    events: { after: (orig, dest) => play(orig, dest) },
                  }}
                  drawable={{ enabled: true, visible: true, autoShapes: shapes }}
                />
              </Box>
              {inBook < path.length && (
                <Group gap={4} wrap="wrap" justify="space-between">
                  <Text size="xs" c="orange" style={{ flex: "1 1 180px" }}>
                    {inBook === 0
                      ? t(
                          "Preparation.Book.LeftGamesStart",
                          "Outside {{name}}'s games from the first move.",
                          { name },
                        )
                      : t(
                          "Preparation.Book.LeftGames",
                          "Outside {{name}}'s games after {{line}}.",
                          { name, line: lineSan(path.slice(0, inBook)) },
                        )}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    style={{ flexShrink: 0 }}
                    onClick={() => setPath((previous) => previous.slice(0, inBook))}
                  >
                    {t("Preparation.Book.BackToGames", "Back to the games")}
                  </Button>
                </Group>
              )}
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
                      c={
                        crumb.index >= inBook
                          ? "orange"
                          : crumb.index === path.length - 1
                            ? undefined
                            : "dimmed"
                      }
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
            <BookMovesList
              book={book}
              fen={fen}
              name={name}
              onPick={(move) => setPath((previous) => [...previous, move.uci])}
            />
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
