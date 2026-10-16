import { ActionIcon, Badge, Group, Paper, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconChessKnight, IconGridDots, IconInfoCircle } from "@tabler/icons-react";
import { Fragment, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PawnStructure } from "@/bindings";
import { gamesWithStructure, gameTypeRows, structureRows } from "@/utils/preparation/structures";
import type { ProfileGame } from "@/utils/players/profileGames";
import type { ResultBucket } from "@/utils/players/results";
import { RatingParValue } from "../common";
import { formatScore } from "../labels";
import { EmptyState, SectionHeader } from "./common";
import { structureName, structureRule } from "./labels";

function BucketCells({ bucket }: { bucket: ResultBucket }) {
  if (bucket.games === 0)
    return (
      <>
        <Table.Td ta="right" c="dimmed">
          —
        </Table.Td>
        <Table.Td />
        <Table.Td />
      </>
    );
  return (
    <>
      <Table.Td ta="right">{bucket.games}</Table.Td>
      <Table.Td ta="right">{formatScore(bucket.scorePercent)}</Table.Td>
      <Table.Td ta="right">
        <RatingParValue par={bucket} />
      </Table.Td>
    </>
  );
}

/**
 * The eight named pawn structures of I-31 in the player's games, with them and against them, and
 * two kinds of game that need no engine: early queen exchanges and endgames.
 */
export default function StructuresSection({
  games,
  name,
  onOpenGame,
}: {
  games: ProfileGame[];
  name: string;
  onOpenGame: (game: ProfileGame, ply: number | null) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => structureRows(games), [games]);
  const types = useMemo(() => gameTypeRows(games), [games]);
  const withAny = useMemo(
    () => games.filter((game) => (game.structures ?? []).length > 0).length,
    [games],
  );
  const example = (structure: PawnStructure) => {
    const game = gamesWithStructure(games, structure)[0];
    if (!game) return;
    const hit = game.structures.find((candidate) => candidate.structure === structure);
    onOpenGame(game, hit ? hit.ply : null);
  };

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconGridDots size={18} />}
        title={t("Preparation.Structures.Title", "Pawn structures")}
        description={t(
          "Preparation.Structures.Description",
          "Eight named structures, looked for between moves 12 and 25 and counted when they hold for three moves. {{name}} has them (with) or faces them (against).",
          { name },
        )}
        right={
          <Tooltip
            multiline
            w={320}
            label={t(
              "Preparation.Structures.Experimental",
              "The rules are approximate and still being validated against labelled example games. Hover a structure to see its rule.",
            )}
          >
            <Badge variant="outline" color="gray" leftSection={<IconInfoCircle size={12} />}>
              {t("Preparation.Note.Badge", "Experimental")}
            </Badge>
          </Tooltip>
        }
      />

      {rows.length === 0 ? (
        <EmptyState>
          {t(
            "Preparation.Structures.Empty",
            "None of the eight structures appears in these games (games shorter than 15 moves cannot have one).",
          )}
        </EmptyState>
      ) : (
        <Paper withBorder radius="md" p={0}>
          <Table striped highlightOnHover verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th rowSpan={2}>
                  {t("Preparation.Structures.Structure", "Structure")}
                </Table.Th>
                <Table.Th colSpan={3} ta="center">
                  {t("Preparation.Structures.With", "With it")}
                </Table.Th>
                <Table.Th colSpan={3} ta="center">
                  {t("Preparation.Structures.Against", "Against it")}
                </Table.Th>
                <Table.Th rowSpan={2} />
              </Table.Tr>
              <Table.Tr>
                {[0, 1].map((index) => (
                  <Fragment key={index}>
                    <Table.Th ta="right">{t("Players.Games", "Games")}</Table.Th>
                    <Table.Th ta="right">{t("Players.Score", "Score")}</Table.Th>
                    <Table.Th ta="right">{t("RatingPar.Column", "vs. expected")}</Table.Th>
                  </Fragment>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.structure}>
                  <Table.Td>
                    <Tooltip multiline w={300} label={structureRule(row.structure, t)}>
                      <Text size="sm" fw={600} style={{ cursor: "help" }}>
                        {structureName(row.structure, t)}
                      </Text>
                    </Tooltip>
                  </Table.Td>
                  <BucketCells bucket={row.own} />
                  <BucketCells bucket={row.against} />
                  <Table.Td>
                    <Tooltip label={t("Preparation.Structures.Example", "Open the latest example")}>
                      <ActionIcon variant="subtle" onClick={() => example(row.structure)}>
                        <IconChessKnight size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
      <Text size="xs" c="dimmed">
        {t(
          "Preparation.Structures.Coverage",
          "{{count}} of {{total}} games have at least one of these structures.",
          { count: withAny, total: games.length },
        )}
      </Text>

      <Paper withBorder radius="md" p={0}>
        <Table verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Preparation.Structures.GameType", "Kind of game")}</Table.Th>
              <Table.Th ta="right">{t("Players.Games", "Games")}</Table.Th>
              <Table.Th ta="right">{t("Players.Score", "Score")}</Table.Th>
              <Table.Th ta="right">{t("RatingPar.Column", "vs. expected")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(
              [
                [
                  "earlyQueens",
                  t("Preparation.HowTo.EarlyQueens", "Queens exchanged before move 25"),
                ],
                ["endgames", t("Preparation.HowTo.Endgames", "Games that reach an endgame")],
                ["all", t("Preparation.Structures.AllGames", "All games")],
              ] as const
            ).map(([key, label]) => (
              <Table.Tr key={key}>
                <Table.Td>
                  <Group gap={6}>
                    <Text size="sm">{label}</Text>
                    {key === "endgames" && (
                      <Tooltip
                        multiline
                        w={280}
                        label={t(
                          "Preparation.Structures.EndgameRule",
                          "No queens and at most six pieces besides kings and pawns, as Player Analysis defines the endgame.",
                        )}
                      >
                        <IconInfoCircle size={14} color="var(--mantine-color-dimmed)" />
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
                <BucketCells bucket={types[key]} />
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
