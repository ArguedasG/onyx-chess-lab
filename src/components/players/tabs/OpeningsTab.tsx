import {
  ActionIcon,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChessKnight, IconChevronDown, IconChevronRight, IconList } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { parsePGN } from "@/utils/chess";
import {
  buildOpeningTree,
  type OpeningTreeRow,
  visibleOpeningTreeRows,
} from "@/utils/openingFamilies";
import type { ProfileGame } from "@/utils/players/profileGames";
import { openingBuckets, type ResultBucket } from "@/utils/players/results";
import { createTab } from "@/utils/tabs";
import { countMainPly, defaultTree } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import { RatingParValue, ResultBar } from "../common";
import { formatScore } from "../labels";

/**
 * Openings by color as Family → Variation → Subvariation (I-42), every level with its own exact
 * results and rating par (I-30). Subvariations with few games are shown but not interpreted.
 */
export default function OpeningsTab({
  games,
  onShowGames,
}: {
  games: ProfileGame[];
  onShowGames: (opening: string) => void;
}) {
  const { t } = useTranslation();
  const white = useMemo(() => openingBuckets(games, "white"), [games]);
  const black = useMemo(() => openingBuckets(games, "black"), [games]);
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" h="100%" style={{ minHeight: 0 }}>
      <OpeningColumn
        title={t("Players.Openings.White", "With White")}
        color="white"
        buckets={white}
        onShowGames={onShowGames}
      />
      <OpeningColumn
        title={t("Players.Openings.Black", "With Black")}
        color="black"
        buckets={black}
        onShowGames={onShowGames}
      />
    </SimpleGrid>
  );
}

function OpeningColumn({
  title,
  color,
  buckets,
  onShowGames,
}: {
  title: string;
  color: "white" | "black";
  buckets: ReturnType<typeof openingBuckets>;
  onShowGames: (opening: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const tree = useMemo(() => buildOpeningTree(buckets.leaves, buckets.groups), [buckets]);
  const rows = useMemo(() => visibleOpeningTreeRows(tree, expanded), [tree, expanded]);
  const toggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <Group justify="space-between" mb="xs">
        <Text fw={700}>{title}</Text>
        <Text size="xs" c="dimmed">
          {t("Players.GamesCount", "{{count}} games", { count: buckets.games })}
        </Text>
      </Group>
      <Group
        gap="xs"
        px={4}
        pb={6}
        wrap="nowrap"
        style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
      >
        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
          {t("PlayerAnalysis.Opening", "Opening")}
        </Text>
        <Text size="xs" c="dimmed" w={70} ta="right">
          {t("Players.Games", "Games")}
        </Text>
        <Text size="xs" c="dimmed" w={56} ta="right">
          {t("Players.Score", "Score")}
        </Text>
        <Tooltip
          multiline
          w={260}
          label={t(
            "RatingPar.ColumnHint",
            "Score minus the score the rating differences predict, in percentage points.",
          )}
        >
          <Text size="xs" c="dimmed" w={56} ta="right" style={{ cursor: "help" }}>
            {t("RatingPar.Column", "vs. expected")}
          </Text>
        </Tooltip>
        <div style={{ width: 52 }} />
      </Group>
      <ScrollArea style={{ flex: 1 }} offsetScrollbars>
        {rows.length === 0 ? (
          <Text size="sm" c="dimmed" p="sm">
            {t("Players.NoGamesInFilter", "No games match the current filters.")}
          </Text>
        ) : (
          rows.map((row) => (
            <OpeningRow
              key={`${row.node.key}${row.ownOnly ? ":own" : ""}`}
              row={row}
              total={buckets.games}
              color={color}
              expanded={expanded.has(row.node.key)}
              onToggle={() => toggle(row.node.key)}
              onShowGames={onShowGames}
            />
          ))
        )}
      </ScrollArea>
    </Paper>
  );
}

function OpeningRow({
  row,
  total,
  color,
  expanded,
  onToggle,
  onShowGames,
}: {
  row: OpeningTreeRow<ResultBucket>;
  total: number;
  color: "white" | "black";
  expanded: boolean;
  onToggle: () => void;
  onShowGames: (opening: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const { node, depth, ownOnly } = row;
  const bucket = ownOnly && node.own ? node.own : node.value;
  const foldable = !ownOnly && node.children.length > 0;
  const share = total ? (bucket.games / total) * 100 : 0;
  // A leaf, or the "without a more specific variation" row, is a full opening name.
  const fullName = ownOnly || !foldable ? bucket.key : null;

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
    <Stack
      gap={4}
      py={6}
      px={4}
      style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
    >
      <Group gap="xs" wrap="nowrap">
        <Group
          gap={4}
          wrap="nowrap"
          style={{
            flex: 1,
            minWidth: 0,
            paddingLeft: `calc(${depth} * var(--mantine-spacing-md))`,
          }}
        >
          {foldable ? (
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={onToggle}>
              {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </ActionIcon>
          ) : (
            <span style={{ width: 22, flexShrink: 0 }} />
          )}
          <Text
            size="sm"
            fw={depth === 0 ? 600 : undefined}
            c={ownOnly ? "dimmed" : undefined}
            fs={ownOnly ? "italic" : undefined}
            truncate
            title={bucket.key}
            style={{ cursor: foldable ? "pointer" : undefined }}
            onClick={foldable ? onToggle : undefined}
          >
            {ownOnly
              ? t("Openings.Family.WithoutVariation", "Without a more specific variation")
              : node.label}
          </Text>
        </Group>
        <Text size="sm" w={70} ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
          {bucket.games}
          <Text span size="xs" c="dimmed">
            {" "}
            · {share.toFixed(0)}%
          </Text>
        </Text>
        <Text size="sm" w={56} ta="right" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatScore(bucket.scorePercent)}
        </Text>
        <Text w={56} ta="right">
          <RatingParValue par={bucket} />
        </Text>
        <Group gap={2} w={52} justify="flex-end" wrap="nowrap">
          <Tooltip label={t("Players.Openings.ShowGames", "Show these games")}>
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={() => onShowGames(fullName ?? node.key)}
            >
              <IconList size={14} />
            </ActionIcon>
          </Tooltip>
          {fullName && (
            <Tooltip label={t("Players.Openings.OpenBoard", "Open the line on the board")}>
              <ActionIcon size="sm" variant="subtle" onClick={() => void openOnBoard(fullName)}>
                <IconChessKnight size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
      <div style={{ paddingLeft: `calc(${depth} * var(--mantine-spacing-md) + 26px)` }}>
        <ResultBar wins={bucket.wins} draws={bucket.draws} losses={bucket.losses} size={6} />
      </div>
    </Stack>
  );
}
