import { ActionIcon, Button, Group, Table, Text } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildOpeningTree,
  type OpeningTreeRow,
  visibleOpeningTreeRows,
} from "@/utils/openingFamilies";
import type { PlayerAnalysisBucket, PlayerAnalysisReference } from "@/utils/playerAnalysis";

function formatScore(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

/**
 * Openings of a player's analysis as Family → Variation → Subvariation, each level with its own
 * exact results. Profiles generated before the groups existed show the flat list.
 */
export default function PlayerOpeningsTable({
  openings,
  groups,
  onOpen,
}: {
  openings: PlayerAnalysisBucket[];
  groups?: PlayerAnalysisBucket[];
  onOpen: (reference: PlayerAnalysisReference) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const tree = useMemo(
    () => (groups ? buildOpeningTree(openings, groups) : null),
    [openings, groups],
  );
  const rows = useMemo<OpeningTreeRow<PlayerAnalysisBucket>[]>(
    () =>
      tree
        ? visibleOpeningTreeRows(tree, expanded)
        : openings.map((bucket) => ({
            node: { key: bucket.key, label: bucket.key, value: bucket, children: [] },
            depth: 0,
            ownOnly: false,
          })),
    [tree, openings, expanded],
  );
  const toggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <>
      {!groups && (
        <Text size="xs" c="dimmed" mb="xs">
          {t(
            "PlayerAnalysis.OpeningsRecalculate",
            "Recalculate the profile to group the openings by family and variation.",
          )}
        </Text>
      )}
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("PlayerAnalysis.Opening", "Opening")}</Table.Th>
            <Table.Th ta="right">{t("PlayerAnalysis.Games", "Games")}</Table.Th>
            <Table.Th ta="right">{t("PlayerAnalysis.Score", "Score")}</Table.Th>
            <Table.Th>{t("PlayerAnalysis.Record", "W-D-L")}</Table.Th>
            <Table.Th ta="right">{t("PlayerAnalysis.OpponentElo", "Opponent Elo")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(({ node, depth, ownOnly }) => {
            const bucket = ownOnly && node.own ? node.own : node.value;
            const foldable = !ownOnly && node.children.length > 0;
            return (
              <Table.Tr key={`${node.key}${ownOnly ? ":own" : ""}`}>
                <Table.Td>
                  <Group gap={4} wrap="nowrap" pl={`calc(${depth} * var(--mantine-spacing-md))`}>
                    {foldable ? (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => toggle(node.key)}
                        aria-label={
                          expanded.has(node.key)
                            ? t("Common.Collapse", "Collapse")
                            : t("Common.Expand", "Expand")
                        }
                      >
                        {expanded.has(node.key) ? (
                          <IconChevronDown size={14} />
                        ) : (
                          <IconChevronRight size={14} />
                        )}
                      </ActionIcon>
                    ) : (
                      tree && <span style={{ width: 22, flexShrink: 0 }} />
                    )}
                    <Text
                      size="sm"
                      fw={depth === 0 && tree ? 600 : undefined}
                      c={ownOnly ? "dimmed" : undefined}
                      fs={ownOnly ? "italic" : undefined}
                      title={bucket.key}
                      style={{ cursor: foldable ? "pointer" : undefined }}
                      onClick={foldable ? () => toggle(node.key) : undefined}
                    >
                      {ownOnly
                        ? t("Openings.Family.WithoutVariation", "Without a more specific variation")
                        : node.label}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td ta="right">{bucket.games}</Table.Td>
                <Table.Td ta="right">{formatScore(bucket.scorePercent)}</Table.Td>
                <Table.Td>{`${bucket.wins}-${bucket.draws}-${bucket.losses}`}</Table.Td>
                <Table.Td ta="right">{bucket.averageOpponentElo?.toFixed(0) ?? "—"}</Table.Td>
                <Table.Td ta="right">
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    disabled={!bucket.references[0]}
                    onClick={() => bucket.references[0] && onOpen(bucket.references[0])}
                  >
                    {t("PlayerAnalysis.Evidence", "Evidence")}
                  </Button>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </>
  );
}
