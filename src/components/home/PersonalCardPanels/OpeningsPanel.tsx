import { ActionIcon, Divider, Group, ScrollArea, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import type { Color } from "chessops";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerGameInfo } from "@/bindings";
import { commands, type GameOutcome } from "@/bindings";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { parsePGN } from "@/utils/chess";
import {
  buildOpeningFamilies,
  type OpeningFamilyNode,
  type OpeningFamilyRow,
  type OpeningResultCounts,
  visibleOpeningRows,
} from "@/utils/openingFamilies";
import { createTab } from "@/utils/tabs";
import { getTimeControl } from "@/utils/timeControl";
import { countMainPly, defaultTree } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import classes from "./OpeningsPanel.module.css";
import ResultsChart from "./ResultsChart";
import TimeControlSelector from "./TimeControlSelector";
import WebsiteAccountSelector from "./WebsiteAccountSelector";

type OpeningStats = OpeningResultCounts & { name: string };

function aggregateOpenings(
  data: { opening: string; result: GameOutcome; is_player_white: boolean }[],
  color: Color,
): OpeningStats[] {
  return Array.from(
    data
      .filter((d) => d.is_player_white === (color === "white"))
      .reduce((acc, d) => {
        const prev = acc.get(d.opening) ?? {
          won: 0,
          draw: 0,
          lost: 0,
          total: 0,
        };
        acc.set(d.opening, {
          won: prev.won + (d.result === "Won" ? 1 : 0),
          draw: prev.draw + (d.result === "Drawn" ? 1 : 0),
          lost: prev.lost + (d.result === "Lost" ? 1 : 0),
          total: prev.total + 1,
        });
        return acc;
      }, new Map()),
  )
    .map(([name, { won, draw, lost, total }]) => ({
      name,
      games: total,
      won,
      draw,
      lost,
    }))
    .sort((a, b) => b.games - a.games);
}

function OpeningsPanel({
  playerName,
  info,
  isDatabase,
}: {
  playerName: string;
  info: PlayerGameInfo;
  isDatabase?: boolean;
}) {
  const [website, setWebsite] = useState<string | null>("All websites");
  const [account, setAccount] = useState<string | null>("All accounts");
  const [timeControl, setTimeControl] = useState<string | null>(null);

  const openingData =
    info?.site_stats_data
      .filter((d) => website === "All websites" || d.site === website)
      .filter((d) => account === "All accounts" || d.player === account)
      .flatMap((d) => d.data)
      .filter(
        (g) =>
          !timeControl ||
          timeControl === "any" ||
          getTimeControl(website!, g.time_control) === timeControl,
      )
      .map((g) => ({
        opening: g.opening,
        result: g.result,
        is_player_white: g.is_player_white,
      })) ?? [];

  const whiteGames = openingData.filter((g) => g.is_player_white).length;
  const blackGames = openingData.filter((g) => !g.is_player_white).length;

  const whiteFamilies = buildOpeningFamilies(aggregateOpenings(openingData, "white"));
  const blackFamilies = buildOpeningFamilies(aggregateOpenings(openingData, "black"));

  const { t } = useTranslation();

  return (
    <Stack gap={0} h="100%">
      <Group grow>
        {!isDatabase && (
          <WebsiteAccountSelector
            playerName={playerName}
            onWebsiteChange={(website) => {
              setWebsite(website);
            }}
            onAccountChange={setAccount}
            allowAll={true}
          />
        )}
        <TimeControlSelector
          website={website}
          onTimeControlChange={setTimeControl}
          allowAll={true}
        />
      </Group>

      <SimpleGrid cols={2} pt="xl">
        <Text ta="center" fw="bold">
          {t("Common.White", "White")}
        </Text>
        <Text ta="center" fw="bold">
          {t("Common.Black", "Black")}
        </Text>
      </SimpleGrid>
      <Divider mt="md" />
      <ScrollArea flex={1}>
        <SimpleGrid cols={2} spacing="md">
          <OpeningFamilyColumn families={whiteFamilies} totalGames={whiteGames} color="white" />
          <OpeningFamilyColumn families={blackFamilies} totalGames={blackGames} color="black" />
        </SimpleGrid>
      </ScrollArea>
    </Stack>
  );
}

/** Families first; each level unfolds into its variations and subvariations. */
function OpeningFamilyColumn({
  families,
  totalGames,
  color,
}: {
  families: OpeningFamilyNode[];
  totalGames: number;
  color: Color;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const rows = useMemo(() => visibleOpeningRows(families, expanded), [families, expanded]);
  const toggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Stack gap={0}>
      {rows.map((row) => (
        <OpeningDetail
          key={`${row.node.key}${row.ownOnly ? ":own" : ""}`}
          row={row}
          expanded={expanded.has(row.node.key)}
          onToggle={() => toggle(row.node.key)}
          totalGames={totalGames}
          color={color}
        />
      ))}
    </Stack>
  );
}

function OpeningDetail({
  row,
  expanded,
  onToggle,
  totalGames,
  color,
}: {
  row: OpeningFamilyRow;
  expanded: boolean;
  onToggle: () => void;
  totalGames: number;
  color: Color;
}) {
  const { t } = useTranslation();
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const navigate = useNavigate();

  const { node, depth, ownOnly } = row;
  const counts = ownOnly ? node.own : node;
  const foldable = !ownOnly && node.children.length > 0;
  const openingName = ownOnly || !foldable ? node.fullName : undefined;
  const openingRate = totalGames > 0 ? counts.games / totalGames : 0;

  async function openOnBoard(name: string) {
    const pgn = unwrap(await commands.getOpeningFromName(name));
    const headers = defaultTree().headers;
    const tree = await parsePGN(pgn);
    headers.orientation = color;
    createTab({
      tab: { name, type: "analysis" },
      pgn,
      headers,
      setTabs,
      setActiveTab,
      position: Array(countMainPly(tree.root)).fill(0),
    });
    navigate({ to: "/" });
  }

  return (
    <Stack py="xs" gap={6} pl={`calc(${depth} * var(--mantine-spacing-md))`}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
          {foldable ? (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={onToggle}
              aria-label={
                expanded ? t("Common.Collapse", "Collapse") : t("Common.Expand", "Expand")
              }
            >
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </ActionIcon>
          ) : (
            depth > 0 && <span style={{ width: 22, flexShrink: 0 }} />
          )}
          <Text
            lineClamp={2}
            fw={depth === 0 ? 600 : undefined}
            c={ownOnly ? "dimmed" : undefined}
            fs={ownOnly ? "italic" : undefined}
            className={classes.link}
            title={node.fullName}
            onClick={() => (openingName ? void openOnBoard(openingName) : onToggle())}
          >
            {ownOnly
              ? t("Openings.Family.WithoutVariation", "Without a more specific variation")
              : node.label}
          </Text>
        </Group>
        <Text size="sm" style={{ flexShrink: 0 }}>
          {counts.games} · {(openingRate * 100).toFixed(1)}%
        </Text>
      </Group>
      <ResultsChart won={counts.won} draw={counts.draw} lost={counts.lost} size="1.25rem" />
      <Divider />
    </Stack>
  );
}

export default OpeningsPanel;
