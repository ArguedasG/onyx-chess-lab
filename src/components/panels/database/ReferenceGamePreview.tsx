import { ActionIcon, Box, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconExternalLink,
  IconX,
} from "@tabler/icons-react";
import type { Key } from "@lichess-org/chessground/types";
import { chessgroundMove } from "chessops/compat";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWRImmutable from "swr/immutable";
import type { NormalizedGame } from "@/bindings";
import { Chessground } from "@/chessground/Chessground";
import { parsePGN } from "@/utils/chess";
import { treeIteratorMainLine } from "@/utils/treeReducer";
import classes from "./ReferenceGamePreview.module.css";

export type ReferencePreview = {
  game: NormalizedGame;
  /** Ply where the game reaches the analysed position, when the database knows it. */
  ply?: number;
  open: () => void;
};

/** Same placement and side to move; castling and move counters may differ by transposition. */
function samePosition(a: string, b: string) {
  return a.split(" ").slice(0, 2).join(" ") === b.split(" ").slice(0, 2).join(" ");
}

/**
 * A reference game played through next to the table, without leaving the analysed position.
 * It has no keyboard shortcuts on purpose: the arrow keys keep moving the main board.
 */
export default function ReferenceGamePreview({
  preview,
  currentFen,
  onClose,
}: {
  preview: ReferencePreview;
  currentFen: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { game } = preview;
  const { data: tree } = useSWRImmutable(["reference-preview", game.id, game.moves, game.fen], () =>
    parsePGN(game.moves, game.fen || undefined),
  );
  const nodes = useMemo(
    () => (tree ? Array.from(treeIteratorMainLine(tree.root)).map(({ node }) => node) : []),
    [tree],
  );
  const [index, setIndex] = useState(0);

  // Start where the game meets the board position, so the preview continues from it.
  useEffect(() => {
    if (nodes.length === 0) return;
    const matched =
      preview.ply !== undefined
        ? Math.min(preview.ply, nodes.length - 1)
        : nodes.findIndex((node) => samePosition(node.fen, currentFen));
    setIndex(matched >= 0 ? matched : 0);
  }, [nodes, preview.ply, currentFen]);

  const node = nodes[index];
  const last = nodes.length - 1;
  const moveNumber = node && node.halfMoves > 0 ? Math.ceil(node.halfMoves / 2) : 0;
  const moveLabel =
    node?.san && moveNumber > 0
      ? `${moveNumber}${node.halfMoves % 2 === 1 ? "." : "..."} ${node.san}`
      : t("ReferencePreview.Start", "Start");

  return (
    <div className={classes.root}>
      <Box
        className={classes.board}
        onWheel={(event) =>
          setIndex((value) => Math.max(0, Math.min(last, value + (event.deltaY > 0 ? 1 : -1))))
        }
      >
        {node && (
          <Chessground
            fen={node.fen}
            viewOnly
            coordinates={false}
            lastMove={node.move ? (chessgroundMove(node.move) as Key[]) : undefined}
          />
        )}
      </Box>
      <Stack gap={6} className={classes.info}>
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Text size="sm" fw={600} lineClamp={1}>
            {game.white} {game.white_elo ? `(${game.white_elo})` : ""}
          </Text>
          <Tooltip label={t("Common.Close")}>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text size="sm" fw={600} lineClamp={1}>
          {game.black} {game.black_elo ? `(${game.black_elo})` : ""}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={2}>
          {[game.result, game.event, game.date].filter(Boolean).join(" · ")}
        </Text>
        <Text size="sm" ff="monospace">
          {moveLabel}
        </Text>
        <Group gap={2} wrap="nowrap">
          <ActionIcon size="sm" variant="default" onClick={() => setIndex(0)}>
            <IconChevronsLeft size={14} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="default"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          >
            <IconChevronLeft size={14} />
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="default"
            onClick={() => setIndex((value) => Math.min(last, value + 1))}
          >
            <IconChevronRight size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="default" onClick={() => setIndex(last)}>
            <IconChevronsRight size={14} />
          </ActionIcon>
        </Group>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconExternalLink size={14} />}
          onClick={preview.open}
          mt="auto"
        >
          {t("ReferencePreview.Open", "Open in analysis")}
        </Button>
      </Stack>
    </div>
  );
}
