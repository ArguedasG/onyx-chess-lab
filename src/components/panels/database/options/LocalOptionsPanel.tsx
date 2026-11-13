import { Box, Button, Group, SegmentedControl, Stack, Text } from "@mantine/core";
import { type Piece, parseSquare } from "chessops";
import { EMPTY_BOARD_FEN, makeFen, parseFen } from "chessops/fen";
import { useAtom } from "jotai";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chessground } from "@/chessground/Chessground";
import PiecesGrid from "@/components/boards/PiecesGrid";
import GameFilters from "@/components/common/GameFilters";
import { PlayerSearchInput } from "@/components/databases/PlayerSearchInput";
import { currentLocalOptionsAtom } from "@/state/atoms";
import WeakGamesFilterInput from "./WeakGamesFilterInput";

function LocalOptionsPanel({ boardFen }: { boardFen: string }) {
  const { t } = useTranslation();
  const boardRef = useRef(null);
  const [options, setOptions] = useAtom(currentLocalOptionsAtom);

  const setSimilarStructure = async (fen: string) => {
    const setup = parseFen(fen).unwrap();
    for (const square of setup.board.pawn.complement()) {
      setup.board.take(square);
    }
    const fenResult = makeFen(setup);
    setOptions((q) => ({ ...q, type: "partial", fen: fenResult }));
  };

  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);

  return (
    <Stack>
      <Stack gap={4}>
        <Text fw="bold" fz="sm">
          {t("Board.Database.Local.Player")}
        </Text>
        {options.path && (
          <PlayerSearchInput
            label={t("Common.Search")}
            value={options.player ?? undefined}
            file={options.path}
            setValue={(v) => setOptions((q) => ({ ...q, player: v || null }))}
          />
        )}
      </Stack>

      <GameFilters
        eloDescription={t("Board.Database.Local.EloScope")}
        value={{
          color: options.color,
          eloMin: options.elo_min ?? null,
          eloMax: options.elo_max ?? null,
          startDate: options.start_date ?? null,
          endDate: options.end_date ?? null,
          result: options.result,
        }}
        onChange={(value) =>
          setOptions((q) => ({
            ...q,
            color: value.color,
            elo_min: value.eloMin ?? undefined,
            elo_max: value.eloMax ?? undefined,
            start_date: value.startDate ?? undefined,
            end_date: value.endDate ?? undefined,
            result: value.result,
          }))
        }
      />

      <WeakGamesFilterInput />

      <Stack gap={4}>
        <Text fw="bold" fz="sm">
          {t("Board.Database.Local.Position")}
        </Text>
        <SegmentedControl
          data={[
            { value: "exact", label: t("Board.Database.Local.Exact") },
            { value: "partial", label: t("Board.Database.Local.Partial") },
            {
              value: "pawns",
              label: t("Board.Database.Local.PawnStructure", "Pawn structure"),
            },
          ]}
          value={options.type}
          onChange={(v) => setOptions({ ...options, type: v as "exact" | "partial" | "pawns" })}
        />
        {options.type === "pawns" && (
          <Text size="xs" c="dimmed">
            {t(
              "Board.Database.Local.PawnStructure.Desc",
              "Find games that reached the same pawn structure, wherever the other pieces are.",
            )}
          </Text>
        )}
      </Stack>

      <Group>
        <Stack>
          <Box ref={boardRef}>
            <Chessground
              fen={options.fen}
              coordinates={false}
              lastMove={[]}
              movable={{
                free: true,
                color: "both",
                events: {
                  after: (orig, dest) => {
                    const setup = parseFen(options.fen).unwrap();
                    const p = setup.board.take(parseSquare(orig)!)!;
                    setup.board.set(parseSquare(dest)!, p);
                    setOptions((q) => ({ ...q, fen: makeFen(setup) }));
                  },
                },
              }}
              events={{
                select: (key) => {
                  const square = parseSquare(key);
                  if (square && selectedPiece) {
                    const setup = parseFen(options.fen).unwrap();
                    setup.board.set(square, selectedPiece);
                    setOptions((q) => ({ ...q, fen: makeFen(setup) }));
                  }
                },
              }}
            />
          </Box>

          <Group>
            <Button
              variant="default"
              onClick={() => {
                setOptions((q) => ({ ...q, type: "exact", fen: boardFen }));
              }}
            >
              {t("Board.Database.Local.CurrentPosition")}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setSimilarStructure(boardFen);
              }}
            >
              {t("Board.Database.Local.SimilarStructure")}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setOptions((q) => ({ ...q, type: "pawns", fen: boardFen }));
              }}
            >
              {t("Board.Database.Local.PawnStructure", "Pawn structure")}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setOptions((q) => ({
                  ...q,
                  type: "partial",
                  fen: EMPTY_BOARD_FEN,
                }));
              }}
            >
              {t("Fen.Empty")}
            </Button>
          </Group>
        </Stack>

        <Box flex={1} style={{ display: "flex", flexDirection: "column" }} h="30rem">
          <PiecesGrid
            boardRef={boardRef}
            fen={options.fen}
            vertical
            onPut={(newFen) => {
              setOptions((q) => ({ ...q, fen: newFen }));
            }}
            onSelectPiece={setSelectedPiece}
            selectedPiece={selectedPiece}
          />
        </Box>
      </Group>
    </Stack>
  );
}

export default LocalOptionsPanel;
