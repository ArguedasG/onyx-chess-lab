import {
  Badge,
  Box,
  Group,
  Progress,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type BookMove, bookPosition, type PlayerBook, playerPar } from "@/utils/preparation/book";
import { ResultBar } from "../common";
import { formatScore } from "../labels";
import { signed } from "./common";

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

/**
 * The player's moves in a position of the book: share of the games, wins, draws and losses of
 * the player, score and rating par, and a mark on recent deviations. Used by the likely
 * repertoire and by the board's database panel.
 */
export default function BookMovesList({
  book,
  fen,
  name,
  onPick,
  mah = 460,
}: {
  book: PlayerBook;
  fen: string;
  name: string;
  onPick: (move: BookMove) => void;
  mah?: number | string;
}) {
  const { t } = useTranslation();
  const position = bookPosition(book, fen);
  const latest = useMemo(() => latestDay(book), [book]);
  const total = position?.moves.reduce((sum, move) => sum + move.games, 0) ?? 0;

  const isNew = (move: BookMove) =>
    Boolean(
      latest &&
      move.firstDay &&
      daysBetween(move.firstDay, latest) <= NEW_DAYS &&
      total - move.games >= 3,
    );

  if (!position || position.moves.length === 0)
    return (
      <Text size="sm" c="dimmed">
        {t(
          "Preparation.Book.NoMoves",
          "No game of the filters continues from here (the book reads the first ten moves).",
        )}
      </Text>
    );

  return (
    <ScrollArea.Autosize mah={mah} offsetScrollbars>
      <Stack gap={4}>
        {position.moves.map((move) => {
          const share = total ? (move.games / total) * 100 : 0;
          const par = playerPar(book, fen, move);
          const known = move.white + move.draws + move.black;
          const wins = book.color === "white" ? move.white : move.black;
          const losses = book.color === "white" ? move.black : move.white;
          return (
            <UnstyledButton
              key={move.uci}
              onClick={() => onPick(move)}
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
  );
}
