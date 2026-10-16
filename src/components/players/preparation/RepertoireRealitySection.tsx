import {
  ActionIcon,
  Badge,
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconBook2, IconChessKnight, IconGitCompare } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trainingAreasAtom } from "@/state/trainingAreas";
import type { PlayerBooks } from "@/utils/preparation/book";
import { compareWithRepertoire, repertoireTree } from "@/utils/preparation/repertoireReality";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { StatTile } from "../common";
import { formatScore } from "../labels";
import { EmptyState, LineText, SectionHeader, signed } from "./common";
import { colorName } from "./labels";

const MAX_EXITS = 30;

/**
 * Repertoire against reality (I-19). Own card: where the user's games leave their Onyx
 * repertoire, separating forgotten lines from replies the repertoire lacks. Rival card: the
 * rival's replies that the user's repertoire does not answer.
 */
export default function RepertoireRealitySection({
  books,
  name,
  isSelf,
  onOpenLine,
}: {
  books: PlayerBooks;
  name: string;
  isSelf: boolean;
  onOpenLine: (moves: string[]) => void;
}) {
  const { t } = useTranslation();
  const openings = useAtomValue(trainingAreasAtom).openings;
  /** The color of the user's repertoire. */
  const [color, setColor] = useState<GeneratorColor>("white");
  const [selected, setSelected] = useState<string[]>([]);
  const available = useMemo(
    () =>
      Object.values(openings.repertoires)
        .filter((repertoire) => repertoire.color === color || repertoire.color === "both")
        .map((repertoire) => ({ value: repertoire.id, label: repertoire.name })),
    [color, openings.repertoires],
  );
  const ids = useMemo(
    () => selected.filter((id) => available.some((item) => item.value === id)),
    [available, selected],
  );
  const tree = useMemo(
    () => repertoireTree(openings, color, ids.length ? ids : undefined),
    [color, ids, openings],
  );
  // Own games with that color, or the rival's games with the other one.
  const book = isSelf ? books[color] : books[color === "white" ? "black" : "white"];
  const result = useMemo(
    () => compareWithRepertoire(book, tree, isSelf ? "self" : "rival"),
    [book, isSelf, tree],
  );
  const own = result.exits.filter((exit) => exit.kind === "own");
  const gaps = result.exits.filter((exit) => exit.kind === "gap");
  const unused = result.lineUse
    .filter((line) => line.games <= 1)
    .sort((a, b) => a.reached - b.reached)
    .slice(0, 8);

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconGitCompare size={18} />}
        title={
          isSelf
            ? t("Preparation.Reality.TitleSelf", "My repertoire against my games")
            : t("Preparation.Reality.Title", "My repertoire against {{name}}", { name })
        }
        description={
          isSelf
            ? t(
                "Preparation.Reality.DescriptionSelf",
                "Where your games leave your Onyx repertoires: a different move of yours is a forgotten line; a reply the repertoire does not cover is a gap in the preparation.",
              )
            : t(
                "Preparation.Reality.Description",
                "The replies {{name}} actually plays that your Onyx repertoire does not answer, most played first.",
                { name },
              )
        }
      />

      <Paper withBorder radius="md" p="md">
        <Group gap="md" align="flex-end" wrap="wrap">
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              {t("Preparation.Reality.MyColor", "My repertoire with")}
            </Text>
            <SegmentedControl
              size="xs"
              value={color}
              onChange={(value) => setColor(value as GeneratorColor)}
              data={(["white", "black"] as const).map((value) => ({
                value,
                label: colorName(value, t),
              }))}
            />
          </Stack>
          <MultiSelect
            style={{ flex: 1, minWidth: 240 }}
            label={t("Preparation.Reality.Repertoires", "Repertoires")}
            placeholder={t("Preparation.Reality.AllRepertoires", "All of this color")}
            data={available}
            value={ids}
            onChange={setSelected}
            clearable
            searchable
          />
        </Group>
      </Paper>

      {available.length === 0 || tree.lines.length === 0 ? (
        <EmptyState>
          {t(
            "Preparation.Reality.NoRepertoire",
            "No Onyx repertoire with this color starts from the initial position. Create one in Training → Openings (or with the generator) to compare it.",
          )}
        </EmptyState>
      ) : book.games === 0 ? (
        <EmptyState>
          {t("Preparation.Book.Empty", "No games with this color in the current filters.")}
        </EmptyState>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
            <StatTile
              label={t("Preparation.Reality.Inside", "Games in the repertoire")}
              value={result.games}
              hint={t("Preparation.Reality.InsideHint", "of {{count}}", { count: book.games })}
            />
            <StatTile
              label={t("Preparation.Reality.Completed", "Reached the end")}
              value={result.completed}
              hint={t("Preparation.Reality.CompletedHint", "of a prepared line")}
              accent="teal"
            />
            {isSelf && (
              <StatTile
                label={t("Preparation.Reality.Own", "My deviations")}
                value={own.reduce((sum, exit) => sum + exit.games, 0)}
                accent="orange"
              />
            )}
            <StatTile
              label={t("Preparation.Reality.Gaps", "Uncovered replies")}
              value={gaps.reduce((sum, exit) => sum + exit.games, 0)}
              accent="red"
            />
          </SimpleGrid>

          {result.exits.length === 0 ? (
            <EmptyState>
              {t(
                "Preparation.Reality.NoExits",
                "Every game stays inside the repertoire until it ends or the book ends.",
              )}
            </EmptyState>
          ) : (
            <Paper withBorder radius="md" p={0}>
              <Table striped highlightOnHover verticalSpacing={6}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Preparation.Reality.Where", "Where")}</Table.Th>
                    <Table.Th>{t("Preparation.Reality.Played", "Played")}</Table.Th>
                    <Table.Th>{t("Preparation.Reality.Kind", "Kind")}</Table.Th>
                    <Table.Th ta="right">{t("Players.Games", "Games")}</Table.Th>
                    <Table.Th ta="right">
                      {isSelf
                        ? t("Players.Score", "Score")
                        : t("Preparation.Reality.TheirScore", "Their score")}
                    </Table.Th>
                    <Table.Th ta="right">{t("RatingPar.Column", "vs. expected")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {result.exits.slice(0, MAX_EXITS).map((exit) => (
                    <Table.Tr key={`${exit.path.join(" ")}:${exit.move.uci}`}>
                      <Table.Td maw={300}>
                        <LineText moves={exit.path} max={8} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={700} ff="monospace">
                          {exit.move.san}
                        </Text>
                        {exit.kind === "own" && exit.prepared.length > 0 && (
                          <Text size="xs" c="dimmed">
                            {t("Preparation.Reality.Prepared", "prepared: {{moves}}", {
                              moves: exit.prepared.join(", "),
                            })}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {exit.kind === "own" ? (
                          <Badge size="sm" variant="light" color="orange">
                            {t("Preparation.Reality.KindOwn", "Forgotten line")}
                          </Badge>
                        ) : (
                          <Badge size="sm" variant="light" color="red">
                            {t("Preparation.Reality.KindGap", "Not covered")}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">{exit.games}</Table.Td>
                      <Table.Td ta="right">{formatScore(exit.scorePercent)}</Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" c={exit.ratedGames < 10 ? "dimmed" : undefined}>
                          {signed(exit.par)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip
                          multiline
                          w={260}
                          label={t(
                            "Preparation.Reality.OpenHint",
                            "Open the line on the board, where “Add to repertoire” adds it.",
                          )}
                        >
                          <ActionIcon
                            variant="subtle"
                            onClick={() => onOpenLine([...exit.path, exit.move.uci])}
                          >
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

          {isSelf && unused.length > 0 && (
            <Paper withBorder radius="md" p="md">
              <Group gap="xs" mb="xs">
                <IconBook2 size={16} />
                <Text fw={700}>
                  {t("Preparation.Reality.Unused", "Studied lines that rarely appear")}
                </Text>
              </Group>
              <Stack gap={6}>
                {unused.map((line) => (
                  <Group key={line.id} justify="space-between" wrap="nowrap">
                    <LineText moves={line.moves} max={12} />
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {line.games === 0
                        ? t(
                            "Preparation.Reality.UnusedReached",
                            "games follow it for {{count}} moves",
                            {
                              count: Math.ceil(line.reached / 2),
                            },
                          )
                        : t("Preparation.Reality.UnusedOne", "one game to the end")}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}
