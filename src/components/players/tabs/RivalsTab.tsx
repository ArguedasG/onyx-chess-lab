import {
  ActionIcon,
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import {
  IconExternalLink,
  IconSearch,
  IconSwords,
  IconTarget,
  IconUsers,
} from "@tabler/icons-react";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlayerAnalysisSource } from "@/utils/playerAnalysis";
import type { ProfileGame } from "@/utils/players/profileGames";
import { resultBucket } from "@/utils/players/results";
import {
  gamesAgainst,
  MIN_RIVAL_GAMES,
  nemesisAndFavourite,
  rivalBalance,
  rivalKey,
  rivals,
  type RivalSummary,
} from "@/utils/players/rivals";
import { formatDay, RatingParValue, ResultBar, SectionTitle } from "../common";
import { formatScore } from "../labels";

const PAGE_SIZE = 25;

/** Frequent rivals, nemesis and favourite opponent, and the record against the user (I-45). */
export default function RivalsTab({
  games,
  selfSources,
  isSelf,
  onOpenGame,
}: {
  games: ProfileGame[];
  /** The user's own records, to show the head-to-head from a rival's card. */
  selfSources: PlayerAnalysisSource[];
  isSelf: boolean;
  onOpenGame: (game: ProfileGame) => void;
}) {
  const { t } = useTranslation();
  const list = useMemo(() => rivals(games), [games]);
  const { nemesis, favourite } = useMemo(() => nemesisAndFavourite(list), [list]);
  const againstYou = useMemo(
    () => (isSelf ? [] : gamesAgainst(games, selfSources)),
    [games, isSelf, selfSources],
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<RivalSummary>>({
    columnAccessor: "games",
    direction: "desc",
  });
  const gamesByRival = useMemo(() => {
    const groups = new Map<string, ProfileGame[]>();
    for (const game of games) {
      const key = rivalKey(game);
      groups.set(key, [...(groups.get(key) ?? []), game]);
    }
    return groups;
  }, [games]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle ? list.filter((rival) => rival.name.toLowerCase().includes(needle)) : list;
    const direction = sortStatus.direction === "asc" ? 1 : -1;
    const value = (rival: RivalSummary): number | string => {
      switch (sortStatus.columnAccessor) {
        case "name":
          return rival.name.toLowerCase();
        case "scorePercent":
          return rival.scorePercent ?? -1;
        case "parDelta":
          return rivalBalance(rival) ?? -1000;
        case "averageOpponentElo":
          return rival.averageOpponentElo ?? 0;
        case "lastDay":
          return rival.lastDay ?? "";
        default:
          return rival.games;
      }
    };
    return [...rows].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      return (left < right ? -1 : left > right ? 1 : 0) * direction;
    });
  }, [list, search, sortStatus]);

  const mostPlayed = list[0];
  const headToHead = againstYou.length > 0 ? resultBucket("you", againstYou) : null;

  return (
    <Stack gap="md" pb="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <RivalCard
          icon={<IconUsers size={18} />}
          color="blue"
          title={t("Players.Rivals.MostPlayed", "Most played")}
          rival={mostPlayed}
          empty={t("Players.Rivals.None", "No rivals yet")}
        />
        <RivalCard
          icon={<IconSwords size={18} />}
          color="red"
          title={t("Players.Rivals.Nemesis", "Nemesis")}
          rival={nemesis}
          empty={t(
            "Players.Rivals.NoNemesis",
            "No rival with {{count}}+ games and a negative balance",
            {
              count: MIN_RIVAL_GAMES,
            },
          )}
        />
        <RivalCard
          icon={<IconTarget size={18} />}
          color="teal"
          title={t("Players.Rivals.Favourite", "Favourite opponent")}
          rival={favourite}
          empty={t(
            "Players.Rivals.NoFavourite",
            "No rival with {{count}}+ games and a positive balance",
            {
              count: MIN_RIVAL_GAMES,
            },
          )}
        />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {t(
          "Players.Rivals.Scope",
          "Nemesis and favourite opponent need {{count}} games. They are ranked by score against what the rating difference predicts, so a stronger rival is not a nemesis just for being stronger.",
          { count: MIN_RIVAL_GAMES },
        )}
      </Text>

      {headToHead && (
        <Paper withBorder radius="md" p="md">
          <Stack gap="xs">
            <SectionTitle
              title={t("Players.Rivals.AgainstYou", "Against you")}
              description={t(
                "Players.Rivals.AgainstYouHint",
                "Games between this player and your own records in the same databases, from this player's side.",
              )}
              right={
                <Group gap="md">
                  <Text size="sm" fw={600}>
                    {headToHead.wins}-{headToHead.draws}-{headToHead.losses}
                  </Text>
                  <Text size="sm">{formatScore(headToHead.scorePercent)}</Text>
                </Group>
              }
            />
            <ResultBar wins={headToHead.wins} draws={headToHead.draws} losses={headToHead.losses} />
            <GameList games={againstYou} onOpenGame={onOpenGame} />
          </Stack>
        </Paper>
      )}

      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <SectionTitle
            title={t("Players.Rivals.All", "All rivals")}
            description={t(
              "Players.Rivals.AllHint",
              "Click a row to see the games against that rival.",
            )}
            right={
              <TextInput
                size="xs"
                w={200}
                leftSection={<IconSearch size={14} />}
                placeholder={t("Players.Rivals.Search", "Search rival")}
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                  setPage(1);
                }}
              />
            }
          />
          <DataTable<RivalSummary>
            withTableBorder
            borderRadius="md"
            highlightOnHover
            idAccessor="key"
            records={filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
            totalRecords={filtered.length}
            recordsPerPage={PAGE_SIZE}
            page={page}
            onPageChange={setPage}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
            noRecordsText={t("Players.Rivals.None", "No rivals yet")}
            paginationText={({ from, to, totalRecords }) => `${from}–${to} / ${totalRecords}`}
            rowExpansion={{
              allowMultiple: true,
              expanded: { recordIds: expanded, onRecordIdsChange: setExpanded },
              content: ({ record }) => (
                <Stack p="sm" gap="xs">
                  <GameList games={gamesByRival.get(record.key) ?? []} onOpenGame={onOpenGame} />
                </Stack>
              ),
            }}
            columns={[
              {
                accessor: "name",
                title: t("Players.Rivals.Rival", "Rival"),
                sortable: true,
                render: (rival) => (
                  <Text size="sm" fw={500}>
                    {rival.name}
                  </Text>
                ),
              },
              {
                accessor: "games",
                title: t("Players.Games", "Games"),
                sortable: true,
                textAlign: "right",
                width: 80,
              },
              {
                accessor: "record",
                title: t("PlayerAnalysis.Record", "W-D-L"),
                width: 170,
                render: (rival) => (
                  <Stack gap={2}>
                    <Text size="xs">{`${rival.wins}-${rival.draws}-${rival.losses}`}</Text>
                    <ResultBar
                      wins={rival.wins}
                      draws={rival.draws}
                      losses={rival.losses}
                      size={5}
                    />
                  </Stack>
                ),
              },
              {
                accessor: "scorePercent",
                title: t("Players.Score", "Score"),
                sortable: true,
                textAlign: "right",
                width: 80,
                render: (rival) => formatScore(rival.scorePercent),
              },
              {
                accessor: "parDelta",
                title: t("RatingPar.Column", "vs. expected"),
                sortable: true,
                textAlign: "right",
                width: 100,
                render: (rival) => <RatingParValue par={rival} />,
              },
              {
                accessor: "averageOpponentElo",
                title: t("Players.Rivals.Elo", "Elo"),
                sortable: true,
                textAlign: "right",
                width: 80,
                render: (rival) => rival.averageOpponentElo?.toFixed(0) ?? "—",
              },
              {
                accessor: "lastDay",
                title: t("Players.Rivals.Last", "Last game"),
                sortable: true,
                width: 120,
                render: (rival) => formatDay(rival.lastDay),
              },
            ]}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}

function RivalCard({
  icon,
  color,
  title,
  rival,
  empty,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  rival: RivalSummary | null | undefined;
  empty: string;
}) {
  const { t } = useTranslation();
  return (
    <Paper withBorder radius="md" p="sm">
      <Stack gap={6}>
        <Group gap={8}>
          <ThemeIcon variant="light" color={color} radius="xl" size="md">
            {icon}
          </ThemeIcon>
          <Text size="sm" fw={600} c="dimmed">
            {title}
          </Text>
        </Group>
        {rival ? (
          <>
            <Text fw={700} fz="lg" lineClamp={1}>
              {rival.name}
            </Text>
            <Group gap="xs">
              <Badge variant="light" color="gray" size="sm">
                {t("Players.GamesCount", "{{count}} games", { count: rival.games })}
              </Badge>
              <Text size="xs">{`${rival.wins}-${rival.draws}-${rival.losses}`}</Text>
              <RatingParValue par={rival} size="xs" />
            </Group>
          </>
        ) : (
          <Text size="xs" c="dimmed">
            {empty}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

function GameList({
  games,
  onOpenGame,
}: {
  games: ProfileGame[];
  onOpenGame: (game: ProfileGame) => void;
}) {
  const { t } = useTranslation();
  return (
    <Table verticalSpacing={4} fz="sm" highlightOnHover>
      <Table.Tbody>
        {games.slice(0, 30).map((game) => (
          <Table.Tr key={game.key} style={{ cursor: "pointer" }} onClick={() => onOpenGame(game)}>
            <Table.Td w={110}>{formatDay(game.day)}</Table.Td>
            <Table.Td w={70}>
              {game.isWhite ? t("Fen.White", "White") : t("Fen.Black", "Black")}
            </Table.Td>
            <Table.Td w={80}>
              <Text
                span
                size="sm"
                fw={600}
                c={game.outcome === "win" ? "teal" : game.outcome === "loss" ? "red" : "dimmed"}
              >
                {game.result}
              </Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" lineClamp={1}>
                {game.opening || game.eco || "—"}
              </Text>
            </Table.Td>
            <Table.Td w={40} ta="right">
              <ActionIcon size="sm" variant="subtle">
                <IconExternalLink size={14} />
              </ActionIcon>
            </Table.Td>
          </Table.Tr>
        ))}
        {games.length > 30 && (
          <Table.Tr>
            <Table.Td colSpan={5}>
              <Text size="xs" c="dimmed">
                {t("Players.Rivals.MoreGames", "And {{count}} more in the Games tab.", {
                  count: games.length - 30,
                })}
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );
}
