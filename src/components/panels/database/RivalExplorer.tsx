import { Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import BookMovesList from "@/components/players/preparation/BookMovesList";
import { colorName } from "@/components/players/preparation/labels";
import type { RivalBook } from "@/state/atoms";
import { bookPosition } from "@/utils/preparation/book";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";

/**
 * The "Rival" source of the database panel: the moves of the player a line was opened from, in
 * the board's position, with the same figures as the likely repertoire. A click plays the move.
 */
export default function RivalExplorer({ rival, fen }: { rival: RivalBook; fen: string }) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const makeMove = useStore(store, (s) => s.makeMove);
  const [choice, setChoice] = useState<GeneratorColor | "auto">("auto");
  const { books, name } = rival;
  // By default, the color with more of the player's games in this position.
  const games = (color: GeneratorColor) => bookPosition(books[color], fen)?.games ?? 0;
  const color: GeneratorColor =
    choice !== "auto"
      ? choice
      : games("white") || games("black")
        ? games("white") >= games("black")
          ? "white"
          : "black"
        : books.white.games >= books.black.games
          ? "white"
          : "black";
  const position = bookPosition(books[color], fen);

  return (
    <Stack gap="xs" flex={1} mih={0}>
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Text size="sm" fw={700}>
          {position && position.moves.length > 0
            ? t("Board.Database.Rival.Moves", "Moves of {{name}} here · {{count}} games", {
                name,
                count: position.games,
              })
            : t("Board.Database.Rival.Out", "Outside {{name}}'s games", { name })}
        </Text>
        <SegmentedControl
          size="xs"
          value={color}
          onChange={(value) => setChoice(value as GeneratorColor)}
          data={(["white", "black"] as const).map((value) => ({
            value,
            label: t("Preparation.Book.WithColor", "With {{color}} · {{count}}", {
              color: colorName(value, t).toLowerCase(),
              count: books[value].games,
            }),
          }))}
        />
      </Group>
      <BookMovesList
        book={books[color]}
        fen={fen}
        name={name}
        mah="100%"
        onPick={(move) => makeMove({ payload: move.san })}
      />
      <Text size="xs" c="dimmed">
        {t(
          "Preparation.Book.Legend",
          "Bar: share of the games. Then wins, draws and losses of {{name}}, score and rating par.",
          { name },
        )}
      </Text>
    </Stack>
  );
}
