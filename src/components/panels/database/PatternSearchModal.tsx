import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconCircleOff, IconEraser } from "@tabler/icons-react";
import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { type Piece, parseSquare } from "chessops";
import { EMPTY_BOARD_FEN, makeFen, parseFen } from "chessops/fen";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chessground } from "@/chessground/Chessground";
import PiecesGrid from "@/components/boards/PiecesGrid";
import { Modal } from "@/components/common/Modal";
import type { PatternOptions } from "./DatabasePanel";

type Tool = { kind: "piece"; piece: Piece } | { kind: "empty" } | { kind: "erase" };

export type PatternSearch = { fen: string; pattern: PatternOptions };

/** Only the piece placement matters in a pattern; the rest of the FEN is fixed. */
function boardOnly(fen: string): string {
  return `${fen.split(" ")[0]} w - - 0 1`;
}

/**
 * Draws a piece pattern to look for in the reference database: pieces that must stand on their
 * squares (whatever else is on the board), squares that must be empty, the side to move and,
 * optionally, "exactly these pieces".
 */
export default function PatternSearchModal({
  opened,
  onClose,
  initial,
  boardFen,
  onSearch,
}: {
  opened: boolean;
  onClose: () => void;
  /** The pattern being searched, to edit it; null starts from an empty board. */
  initial: PatternSearch | null;
  /** The position on the board, to start a pattern from it. */
  boardFen: string;
  onSearch: (search: PatternSearch) => void;
}) {
  const { t } = useTranslation();
  const boardRef = useRef<HTMLDivElement>(null);
  const [fen, setFen] = useState(EMPTY_BOARD_FEN);
  const [empty, setEmpty] = useState<string[]>([]);
  const [turn, setTurn] = useState<"any" | "white" | "black">("any");
  const [exactMaterial, setExactMaterial] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);

  // Each opening starts from the pattern being searched, so cancelling leaves it as it was.
  useEffect(() => {
    if (!opened) return;
    setFen(initial ? boardOnly(initial.fen) : EMPTY_BOARD_FEN);
    setEmpty(initial?.pattern.empty ?? []);
    setTurn(initial?.pattern.turn ?? "any");
    setExactMaterial(initial?.pattern.exactMaterial ?? false);
    setTool(null);
  }, [opened, initial]);

  const pieceCount = parseFen(fen).unwrap().board.occupied.size();
  const conditions = pieceCount + empty.length + (turn === "any" ? 0 : 1);

  function applyTool(key: string) {
    const square = parseSquare(key);
    if (square === undefined || !tool) return;
    const setup = parseFen(fen).unwrap();
    if (tool.kind === "piece") {
      setup.board.set(square, tool.piece);
      setEmpty((current) => current.filter((name) => name !== key));
    } else {
      setup.board.take(square);
      if (tool.kind === "empty") {
        setEmpty((current) =>
          current.includes(key) ? current.filter((name) => name !== key) : [...current, key],
        );
      } else {
        setEmpty((current) => current.filter((name) => name !== key));
      }
    }
    setFen(makeFen(setup));
  }

  const shapes: DrawShape[] = empty.map((key) => ({ orig: key as Key, brush: "red" }));
  const toolButton = (kind: "empty" | "erase", label: string, icon: React.ReactNode) => (
    <Button
      size="xs"
      variant={tool?.kind === kind ? "filled" : "default"}
      leftSection={icon}
      onClick={() => setTool(tool?.kind === kind ? null : { kind })}
    >
      {label}
    </Button>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={t("PatternSearch.Title", "Search a piece pattern")}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t(
            "PatternSearch.Intro",
            "Place only what matters: the games where these pieces stood on these squares at some moment are found, whatever the rest of the board. Pick a piece and click squares; mark squares that must be empty with the red circle.",
          )}
        </Text>
        <Group align="flex-start" wrap="nowrap" gap="lg">
          <Box ref={boardRef} w={360} style={{ flexShrink: 0 }}>
            <Chessground
              fen={fen}
              coordinates
              lastMove={[]}
              movable={{
                free: true,
                color: "both",
                events: {
                  after: (orig, dest) => {
                    const setup = parseFen(fen).unwrap();
                    const piece = setup.board.take(parseSquare(orig)!);
                    if (piece) setup.board.set(parseSquare(dest)!, piece);
                    setEmpty((current) => current.filter((name) => name !== dest));
                    setFen(makeFen(setup));
                  },
                },
              }}
              drawable={{ enabled: false, autoShapes: shapes }}
              events={{ select: (key) => applyTool(key) }}
            />
          </Box>
          <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
            <PiecesGrid
              boardRef={boardRef}
              fen={fen}
              onPut={(next) => setFen(next)}
              selectedPiece={tool?.kind === "piece" ? tool.piece : null}
              onSelectPiece={(piece) => setTool(piece ? { kind: "piece", piece } : null)}
            />
            <Group gap="xs">
              {toolButton(
                "empty",
                t("PatternSearch.EmptySquare", "Empty square"),
                <IconCircleOff size={14} />,
              )}
              {toolButton("erase", t("PatternSearch.Erase", "Erase"), <IconEraser size={14} />)}
            </Group>
            <SimpleGrid cols={2} spacing="xs">
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  setFen(boardOnly(boardFen));
                  setEmpty([]);
                }}
              >
                {t("PatternSearch.FromBoard", "Start from the board")}
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => {
                  setFen(EMPTY_BOARD_FEN);
                  setEmpty([]);
                }}
              >
                {t("PatternSearch.ClearBoard", "Clear")}
              </Button>
            </SimpleGrid>
            <Stack gap={4}>
              <Text fw="bold" fz="sm">
                {t("PatternSearch.Turn", "Side to move")}
              </Text>
              <SegmentedControl
                size="xs"
                value={turn}
                onChange={(value) => setTurn(value as typeof turn)}
                data={[
                  { value: "any", label: t("Board.Database.Local.EitherColor") },
                  { value: "white", label: t("Fen.White") },
                  { value: "black", label: t("Fen.Black") },
                ]}
              />
            </Stack>
            <Checkbox
              checked={exactMaterial}
              onChange={(event) => setExactMaterial(event.currentTarget.checked)}
              label={t("PatternSearch.ExactMaterial", "Only these pieces")}
              description={t(
                "PatternSearch.ExactMaterialDesc",
                "No other piece or pawn on the board, as in an endgame. Kings are always there and need not be drawn.",
              )}
            />
          </Stack>
        </Group>
        <Alert color="gray" variant="light" p="xs">
          <Text size="xs">
            {t(
              "PatternSearch.Speed",
              "A pattern replays every game move by move. The first pattern search in a base also prepares it (on a base of 10 million games, about two minutes and 2 GB on disk, once); after that, each pattern takes seconds. Filters (Elo, dates, player) make it faster.",
            )}
          </Text>
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Common.Cancel")}
          </Button>
          <Button
            disabled={conditions === 0}
            onClick={() =>
              onSearch({
                fen,
                pattern: { empty, turn: turn === "any" ? null : turn, exactMaterial },
              })
            }
          >
            {t("PatternSearch.Search", "Search games")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
