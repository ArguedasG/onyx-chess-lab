import { Badge, Group, Paper, Stack, Table, Text, Tooltip } from "@mantine/core";
import { IconClockHour4 } from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRhythmLabel } from "@/components/boards/RatedGameSelector";
import {
  binPercentile,
  MIN_THINK_MOVES,
  TWIN_RHYTHMS,
  twinThinking,
} from "@/utils/preparation/twin";
import type { ProfileGame } from "@/utils/players/profileGames";

function seconds(value: number) {
  return value >= 10 ? `${value.toFixed(0)} s` : `${value.toFixed(1)} s`;
}

/** The player's think time by rhythm, which the twin copies (9.3). */
export function TwinThinkingCard({ games, name }: { games: ProfileGame[]; name: string }) {
  const { t } = useTranslation();
  const rhythmLabel = useRhythmLabel();
  const thinking = useMemo(() => twinThinking(games), [games]);
  const rows = TWIN_RHYTHMS.map((rhythm) => ({ rhythm, stats: thinking[rhythm] })).filter(
    (row) => row.stats && row.stats.moves > 0,
  );
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Group gap="xs">
          <IconClockHour4 size={16} />
          <Text fw={700}>{t("Preparation.Twin.Thinking", "Think time")}</Text>
        </Group>
        <Text size="xs" c="dimmed">
          {t(
            "Preparation.Twin.ThinkingHint",
            "The twin thinks as long as {{name}} at the rhythm of the game: their average per move after the first ten, how much faster they play the opening, and their quickest and slowest moves, from the clocks of their games. With too few moves at a rhythm it uses their nearest rhythm; without clocks, the times of the catalogue bots of that rating.",
            { name },
          )}
        </Text>
        {rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t(
              "Preparation.Twin.NoClocks",
              "These games have no clocks (over-the-board games usually do not): the twin will think like a catalogue bot of its rating.",
            )}
          </Text>
        ) : (
          <Table withTableBorder verticalSpacing={4}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Preparation.Twin.Rhythm", "Rhythm")}</Table.Th>
                <Table.Th ta="right">{t("Players.Games", "Games")}</Table.Th>
                <Table.Th ta="right">{t("Preparation.Twin.PerMove", "Per move")}</Table.Th>
                <Table.Th ta="right">{t("Preparation.Twin.Opening", "First ten moves")}</Table.Th>
                <Table.Th ta="right">
                  <Tooltip
                    label={t(
                      "Preparation.Twin.RangeHint",
                      "Quickest 10 % and slowest 5 % of the moves after the first ten.",
                    )}
                  >
                    <span>{t("Preparation.Twin.Range", "Range")}</span>
                  </Tooltip>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ rhythm, stats }) => {
                const enough = stats!.moves >= MIN_THINK_MOVES;
                return (
                  <Table.Tr key={rhythm} c={enough ? undefined : "dimmed"}>
                    <Table.Td>
                      <Group gap={6}>
                        {rhythmLabel(rhythm)}
                        {!enough && (
                          <Tooltip
                            label={t(
                              "Preparation.Twin.FewMoves",
                              "Fewer than {{count}} moves: not used for this rhythm.",
                              { count: MIN_THINK_MOVES },
                            )}
                          >
                            <Badge size="xs" variant="outline" color="gray">
                              {t("Preparation.Twin.Few", "few")}
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">{stats!.games}</Table.Td>
                    <Table.Td ta="right">
                      {stats!.moves > 0 ? seconds(stats!.seconds / stats!.moves) : "—"}
                    </Table.Td>
                    <Table.Td ta="right">
                      {stats!.openingMoves > 0
                        ? seconds(stats!.openingSeconds / stats!.openingMoves)
                        : "—"}
                    </Table.Td>
                    <Table.Td ta="right">
                      {stats!.moves > 0
                        ? `${seconds(binPercentile(stats!.bins, 0.1))} – ${seconds(binPercentile(stats!.bins, 0.95))}`
                        : "—"}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}
