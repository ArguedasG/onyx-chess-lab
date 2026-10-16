import { ActionIcon, Badge, Group, ScrollArea, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconExternalLink } from "@tabler/icons-react";
import cx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { difficultyLevel, scorePercent } from "@/utils/repertoireGenerator/scoring";
import type { Surprise } from "@/utils/repertoireGenerator/surprises";
import type {
  Difficulty,
  GeneratedNode,
  GeneratedRepertoire,
} from "@/utils/repertoireGenerator/types";
import classes from "./Generator.module.css";

function pawns(cp: number) {
  return `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
}

export function DifficultyBadge({ value, elo }: { value: Difficulty; elo: number }) {
  const { t } = useTranslation();
  const level = difficultyLevel(value);
  const config = {
    easy: { color: "gray", label: t("Generator.Difficulty.EasyBadge", "Easy") },
    demanding: { color: "orange", label: t("Generator.Difficulty.DemandingBadge", "Demanding") },
    trap: { color: "red", label: t("Generator.Difficulty.TrapBadge", "Trap") },
  }[level];
  return (
    <Tooltip
      multiline
      w={280}
      withArrow
      label={t(
        "Generator.Difficulty.Tooltip",
        "A {{elo}} opponent keeps the evaluation {{chance}}% of the time ({{basis}}). Moves that keep it: {{moves}}.",
        {
          elo,
          chance: Math.round(value.keepProbability * 100),
          basis:
            value.basis === "games"
              ? t("Generator.Difficulty.FromGames", "from {{count}} games", { count: value.sample })
              : t("Generator.Difficulty.FromMaia", "Maia, {{count}} samples", {
                  count: value.sample,
                }),
          moves: value.goodMoves.length,
        },
      )}
    >
      <Badge size="sm" variant="light" color={config.color}>
        {config.label} · {Math.round(value.keepProbability * 100)}%
      </Badge>
    </Tooltip>
  );
}

function moveLabel(parentFen: string, san: string) {
  const [, turn, , , , full] = parentFen.split(" ");
  return turn === "w" ? `${full}. ${san}` : `${full}… ${san}`;
}

function TreeRow({
  parentFen,
  node,
  depth,
  result,
}: {
  parentFen: string;
  node: GeneratedNode;
  depth: number;
  result: GeneratedRepertoire;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(depth < 4);
  const color = result.config.color;
  const score = node.stats
    ? scorePercent(node.stats, node.by === "user" ? color : color === "white" ? "black" : "white")
    : null;
  return (
    <>
      <div className={classes.treeRow} style={{ paddingLeft: depth * 14 + 6 }}>
        {node.children.length > 0 ? (
          <ActionIcon
            size="xs"
            variant="subtle"
            color="gray"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          </ActionIcon>
        ) : (
          <span style={{ width: 18 }} />
        )}
        <Text span size="sm" className={cx(node.by === "user" ? classes.user : classes.opponent)}>
          {moveLabel(parentFen, node.san)}
        </Text>
        {node.by === "opponent" && node.share !== undefined && (
          <Text span size="xs" c="dimmed">
            {Math.round(node.share)}%
          </Text>
        )}
        {node.by === "user" && node.stats && node.stats.games > 0 && (
          <Text span size="xs" c="dimmed">
            {node.stats.games.toLocaleString()} · {score?.toFixed(0)}%
          </Text>
        )}
        {node.by === "user" && node.evalCp !== undefined && (
          <Badge size="xs" variant="outline" color="gray">
            {pawns(node.evalCp)}
          </Badge>
        )}
        {node.surprise && (
          <Badge size="xs" color="grape" variant="light">
            {t("Generator.SurpriseBadge", "Surprise")}
          </Badge>
        )}
        {node.reason === "engineFallback" && (
          <Tooltip label={t("Generator.Comment.Fallback", "Few games here: the engine's move.")}>
            <Badge size="xs" color="violet" variant="dot">
              {t("Generator.EngineBadge", "Engine")}
            </Badge>
          </Tooltip>
        )}
        {node.difficulty && (
          <DifficultyBadge value={node.difficulty} elo={result.config.opponent.elo} />
        )}
        {node.transposition && (
          <Text span size="xs" c="dimmed" fs="italic">
            {t("Generator.Transposition", "transposition")}
          </Text>
        )}
      </div>
      {open &&
        node.children.map((child) => (
          <TreeRow
            key={`${child.uci}-${child.fen}`}
            parentFen={node.fen}
            node={child}
            depth={depth + 1}
            result={result}
          />
        ))}
    </>
  );
}

/** The generated tree: user moves in bold, the opponent's with their share. */
export function GeneratedTreeView({ result }: { result: GeneratedRepertoire }) {
  const { t } = useTranslation();
  if (result.root.children.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t(
          "Generator.Empty",
          "Nothing to generate here: no move passed the engine check, or the source has no games.",
        )}
      </Text>
    );
  }
  return (
    <ScrollArea h={360} offsetScrollbars type="auto">
      <Stack gap={0}>
        {result.root.children.map((child) => (
          <TreeRow
            key={child.uci}
            parentFen={result.root.fen}
            node={child}
            depth={0}
            result={result}
          />
        ))}
      </Stack>
    </ScrollArea>
  );
}

export function SurpriseTable({
  surprises,
  elo,
  onOpen,
}: {
  surprises: Surprise[];
  elo: number;
  onOpen: (surprise: Surprise) => void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollArea h={360} offsetScrollbars type="auto">
      <Table highlightOnHover verticalSpacing={6} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Generator.Surprises.Move", "Surprise")}</Table.Th>
            <Table.Th>{t("Generator.Surprises.Instead", "Instead of")}</Table.Th>
            <Table.Th>{t("Generator.Surprises.Kind", "In the source")}</Table.Th>
            <Table.Th ta="right">{t("Generator.Engine", "Engine")}</Table.Th>
            <Table.Th>{t("Generator.Surprises.ForOpponent", "For the opponent")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {surprises.map((surprise) => (
            <Table.Tr key={`${surprise.index}-${surprise.uci}`}>
              <Table.Td>
                <Text span fw={700}>
                  {moveLabel(surprise.fen, surprise.san)}
                </Text>
              </Table.Td>
              <Table.Td c="dimmed">{surprise.played?.san ?? "—"}</Table.Td>
              <Table.Td>
                {surprise.kind === "novelty" ? (
                  <Badge size="sm" color="red" variant="light">
                    {t("Generator.Surprises.Novelty", "No games")}
                  </Badge>
                ) : (
                  <Badge size="sm" color="teal" variant="light">
                    {t("Generator.Surprises.Rare", "{{share}}% · {{games}} games", {
                      share: surprise.share.toFixed(1),
                      games: surprise.games,
                    })}
                  </Badge>
                )}
              </Table.Td>
              <Table.Td ta="right">
                <Text span size="sm">
                  {pawns(surprise.evalCp)}
                </Text>
                {surprise.loss > 0 && (
                  <Text span size="xs" c="dimmed">
                    {" "}
                    (−{(surprise.loss / 100).toFixed(2)})
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                {surprise.difficulty ? (
                  <DifficultyBadge value={surprise.difficulty} elo={elo} />
                ) : (
                  <Text span size="xs" c="dimmed">
                    —
                  </Text>
                )}
              </Table.Td>
              <Table.Td ta="right">
                <Tooltip label={t("Generator.Surprises.Open", "Open on the board")}>
                  <ActionIcon size="sm" variant="subtle" onClick={() => onOpen(surprise)}>
                    <IconExternalLink size={14} />
                  </ActionIcon>
                </Tooltip>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

export function ResultSummary({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <Group gap="lg">
      {items.map((item) => (
        <div key={item.label}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {item.label}
          </Text>
          <Text fw={700}>{item.value}</Text>
        </div>
      ))}
    </Group>
  );
}
