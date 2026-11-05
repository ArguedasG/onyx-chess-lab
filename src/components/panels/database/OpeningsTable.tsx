import { Group, Progress, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { DataTable } from "mantine-datatable";
import { memo, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { moveNotationTypeAtom } from "@/state/atoms";
import { makeUci } from "chessops";
import { parseSan } from "chessops/san";
import { displayMove } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import type { Opening } from "@/utils/db";
import { formatNumber } from "@/utils/format";
import classes from "./OpeningsTable.module.css";

function OpeningsTable({ openings, loading }: { openings: Opening[]; loading: boolean }) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const makeMove = useStore(store, (s) => s.makeMove);
  const [moveNotationType] = useAtom(moveNotationTypeAtom);
  const fen = useStore(store, (s) => s.currentNode().fen);
  // Long algebraic notation needs the move's squares, so it is read from the position.
  const uciOf = (san: string) => {
    if (moveNotationType !== "lan") return null;
    const [pos] = positionFromFen(fen);
    const move = pos ? parseSan(pos, san) : undefined;
    return move ? makeUci(move) : null;
  };

  const whiteTotal = openings?.reduce((acc, curr) => acc + curr.white, 0);
  const blackTotal = openings?.reduce((acc, curr) => acc + curr.black, 0);
  const drawTotal = openings?.reduce((acc, curr) => acc + curr.draw, 0);
  const unknownTotal = openings.reduce((acc, curr) => acc + (curr.unknown ?? 0), 0);
  const grandTotal = whiteTotal + blackTotal + drawTotal + unknownTotal;

  if (openings.length > 0) {
    openings = [
      ...openings,
      {
        move: "Total",
        white: whiteTotal,
        black: blackTotal,
        draw: drawTotal,
        unknown: unknownTotal,
      },
    ];
  }

  return (
    <DataTable
      withTableBorder
      highlightOnHover
      height="100%"
      verticalSpacing={4}
      records={openings}
      fetching={loading || openings === null}
      rowStyle={(game, i) => {
        if (i === openings.length - 1)
          return {
            fontWeight: 700,
            position: "sticky",
            bottom: 0,
            zIndex: 10,
          };
        return {};
      }}
      columns={[
        {
          accessor: "move",
          width: 100,
          render: ({ move }) => {
            if (move === "*")
              return (
                <Text fz="sm" fs="italic">
                  {t("Board.Database.GameEnd", "Game end")}
                </Text>
              );
            return (
              <Text fz="sm">
                {move === "Total"
                  ? t("Board.Database.Total", "Total")
                  : displayMove(move, moveNotationType, uciOf(move))}
              </Text>
            );
          },
        },
        {
          accessor: "total",
          width: 180,
          render: ({ move, white, draw, black, unknown = 0 }) => {
            const total = white + draw + black + unknown;
            const percentage = grandTotal ? (total / grandTotal) * 100 : 0;
            return (
              <Group>
                {move !== "Total" && <Text fz="sm">{percentage.toFixed(0)}%</Text>}
                <Text fz="sm" flex={1} ta="right">
                  {formatNumber(total)}
                </Text>
              </Group>
            );
          },
        },
        {
          accessor: "results",
          render: ({ black, white, draw, unknown = 0 }) => {
            const total = white + draw + black + unknown || 1;
            const whitePercent = (white / total) * 100;
            const drawPercent = (draw / total) * 100;
            const blackPercent = (black / total) * 100;
            return (
              <div>
                <Progress.Root size="xl" className={classes.result}>
                  <Progress.Section value={whitePercent} className={classes.whiteResultsSection}>
                    <Progress.Label c="black">
                      {whitePercent > 10 ? `${whitePercent.toFixed(1)}%` : ""}
                    </Progress.Label>
                  </Progress.Section>
                  <Progress.Section value={drawPercent} color="gray">
                    <Progress.Label>
                      {drawPercent > 10 ? `${drawPercent.toFixed(1)}%` : ""}
                    </Progress.Label>
                  </Progress.Section>
                  <Progress.Section value={blackPercent} color="black">
                    <Progress.Label>
                      {blackPercent > 10 ? `${blackPercent.toFixed(1)}%` : ""}
                    </Progress.Label>
                  </Progress.Section>
                  <Progress.Section
                    value={(unknown / total) * 100}
                    color="blue"
                    title={t("Board.Database.UnknownResults", { count: unknown })}
                  >
                    <Progress.Label>{unknown ? "?" : ""}</Progress.Label>
                  </Progress.Section>
                </Progress.Root>
                {unknown > 0 && (
                  <Text size="xs" c="dimmed">
                    {t("Board.Database.UnknownResults", { count: unknown })}
                  </Text>
                )}
              </div>
            );
          },
        },
      ]}
      idAccessor="move"
      emptyState={"No games found"}
      onRowClick={({ record }) => {
        if (record.move !== "Total" && record.move !== "*") makeMove({ payload: record.move });
      }}
    />
  );
}

export default memo(OpeningsTable);
