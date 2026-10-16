import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCpu,
  IconDownload,
  IconExternalLink,
  IconNotebook,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddToStudyModal from "@/components/studies/AddToStudyModal";
import { databaseGamesPgn } from "@/utils/databaseGamePgn";
import type { ProfileGame } from "@/utils/players/profileGames";
import { formatDay } from "../common";
import { timeControlLabel } from "../labels";

const PAGE_SIZE = 50;
/** Reading every game to build a PGN takes a moment; more than this is better done from Databases. */
const MAX_EXPORT = 500;

type ResultFilter = "all" | "win" | "draw" | "loss";

function ResultBadge({ game }: { game: ProfileGame }) {
  const { t } = useTranslation();
  const config = {
    win: { color: "teal", label: t("Players.Result.Win", "Win") },
    draw: { color: "gray", label: t("Players.Result.Draw", "Draw") },
    loss: { color: "red", label: t("Players.Result.Loss", "Loss") },
    unknown: { color: "dark", label: "*" },
  }[game.outcome];
  return (
    <Badge variant="light" color={config.color} size="sm" radius="sm">
      {config.label}
    </Badge>
  );
}

function ColorDot({ white }: { white: boolean }) {
  return (
    <Box
      w={12}
      h={12}
      style={{
        borderRadius: 3,
        background: white ? "#f1f1f1" : "#2b2b2b",
        border: "1px solid var(--mantine-color-default-border)",
        flexShrink: 0,
      }}
    />
  );
}

/** Every game of the card (I-13), filterable, with open, engine analysis, study and PGN. */
export default function GamesTab({
  games,
  analyzedKeys,
  onOpenGame,
  onAnalyze,
  onSync,
  syncing,
  playerName,
  initialSearch = "",
}: {
  /** Text to filter by when the tab opens (an opening chosen in the Openings tab). */
  initialSearch?: string;
  games: ProfileGame[];
  analyzedKeys: ReadonlySet<string>;
  onOpenGame: (game: ProfileGame) => void;
  onAnalyze: (games: ProfileGame[]) => void;
  /** Present when the card has connected accounts to download new games from. */
  onSync?: () => void;
  syncing?: boolean;
  playerName: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch] = useDebouncedValue(search, 200);
  const [result, setResult] = useState<ResultFilter>("all");
  const [onlyUnanalyzed, setOnlyUnanalyzed] = useState(false);
  const [page, setPage] = useState(1);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<ProfileGame>>({
    columnAccessor: "day",
    direction: "desc",
  });
  const [selected, setSelected] = useState<ProfileGame[]>([]);
  const [exporting, setExporting] = useState<number | null>(null);
  const [studyGames, setStudyGames] = useState<Array<{ title: string; pgn: string }> | null>(null);

  const filtered = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    const rows = games.filter(
      (game) =>
        (result === "all" || game.outcome === result) &&
        (!onlyUnanalyzed || !analyzedKeys.has(game.key)) &&
        (!needle ||
          game.opponent.toLowerCase().includes(needle) ||
          (game.opening ?? "").toLowerCase().includes(needle) ||
          game.event.toLowerCase().includes(needle)),
    );
    const direction = sortStatus.direction === "asc" ? 1 : -1;
    const value = (game: ProfileGame): string | number => {
      switch (sortStatus.columnAccessor) {
        case "opponent":
          return game.opponent.toLowerCase();
        case "opponentElo":
          return game.opponentElo ?? 0;
        case "plies":
          return game.plies;
        case "opening":
          return (game.opening ?? "").toLowerCase();
        default:
          return `${game.day ?? ""}|${game.time ?? ""}|${String(game.id).padStart(10, "0")}`;
      }
    };
    return [...rows].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      return (left < right ? -1 : left > right ? 1 : 0) * direction;
    });
  }, [analyzedKeys, debouncedSearch, games, onlyUnanalyzed, result, sortStatus]);
  const records = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const target = selected.length > 0 ? selected : filtered;

  async function readPgn(list: ProfileGame[]) {
    setExporting(0);
    try {
      return await databaseGamesPgn(
        list.slice(0, MAX_EXPORT).map((game) => ({
          databasePath: game.source.databasePath,
          gameId: game.id,
        })),
        setExporting,
      );
    } finally {
      setExporting(null);
    }
  }

  async function exportPgn() {
    const path = await save({
      defaultPath: `${playerName.replace(/[\\/:*?"<>|]/g, "_")}.pgn`,
      filters: [{ name: "PGN", extensions: ["pgn"] }],
    });
    if (!path) return;
    try {
      const pgns = await readPgn(target);
      await writeTextFile(path, `${pgns.map((game) => game.pgn.trim()).join("\n\n")}\n`);
      notifications.show({
        color: "green",
        message: t("Players.Games.Exported", "{{count}} games exported.", { count: pgns.length }),
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function sendToStudy() {
    try {
      setStudyGames(await readPgn(target));
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Stack gap="sm" h="100%" style={{ minHeight: 0 }}>
      {studyGames && (
        <AddToStudyModal
          opened
          onClose={() => setStudyGames(null)}
          pgn={studyGames.length === 1 ? studyGames[0].pgn : ""}
          suggestedTitle={studyGames.length === 1 ? studyGames[0].title : playerName}
          sourceLabel={playerName}
          games={studyGames.length === 1 ? undefined : studyGames}
        />
      )}
      <Group justify="space-between" gap="sm">
        <Group gap="sm">
          <TextInput
            size="xs"
            w={220}
            leftSection={<IconSearch size={14} />}
            placeholder={t("Players.Games.Search", "Rival, opening or event")}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
          />
          <SegmentedControl
            size="xs"
            value={result}
            onChange={(value) => {
              setResult(value as ResultFilter);
              setPage(1);
            }}
            data={[
              { value: "all", label: t("Players.Games.All", "All") },
              { value: "win", label: t("Players.Result.Wins", "Wins") },
              { value: "draw", label: t("Players.Result.Draws", "Draws") },
              { value: "loss", label: t("Players.Result.Losses", "Losses") },
            ]}
          />
          <Switch
            size="xs"
            checked={onlyUnanalyzed}
            label={t("Players.Games.Unanalyzed", "Not analyzed")}
            onChange={(event) => {
              setOnlyUnanalyzed(event.currentTarget.checked);
              setPage(1);
            }}
          />
        </Group>
        <Group gap="xs">
          {onSync && (
            <Tooltip
              label={t(
                "Players.Games.SyncHint",
                "Downloads the new games of the connected accounts",
              )}
            >
              <Button
                size="xs"
                variant="default"
                leftSection={<IconRefresh size={14} />}
                loading={syncing}
                onClick={onSync}
              >
                {t("Players.Games.Sync", "Update")}
              </Button>
            </Tooltip>
          )}
          <Button
            size="xs"
            variant="light"
            leftSection={<IconCpu size={14} />}
            disabled={target.length === 0}
            onClick={() => onAnalyze(target)}
          >
            {selected.length > 0
              ? t("Players.Games.AnalyzeSelected", "Analyze {{count}} selected", {
                  count: selected.length,
                })
              : t("Players.Games.AnalyzeFiltered", "Analyze {{count}} in view", {
                  count: filtered.length,
                })}
          </Button>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                size="xs"
                variant="default"
                loading={exporting !== null}
                disabled={target.length === 0}
                leftSection={<IconDownload size={14} />}
              >
                {exporting !== null
                  ? `${Math.round(exporting * 100)}%`
                  : t("Players.Games.Use", "Use games")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                {selected.length > 0
                  ? t("Players.Games.SelectedCount", "{{count}} selected games", {
                      count: selected.length,
                    })
                  : t("Players.Games.InViewCount", "{{count}} games in view", {
                      count: Math.min(filtered.length, MAX_EXPORT),
                    })}
              </Menu.Label>
              <Menu.Item
                leftSection={<IconNotebook size={14} />}
                onClick={() => void sendToStudy()}
              >
                {t("Players.Games.ToStudy", "Add to a study")}
              </Menu.Item>
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => void exportPgn()}>
                {t("Players.Games.ExportPgn", "Export PGN")}
              </Menu.Item>
              {target.length > MAX_EXPORT && (
                <Menu.Label>
                  {t("Players.Games.ExportLimit", "Only the first {{count}} are used.", {
                    count: MAX_EXPORT,
                  })}
                </Menu.Label>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <Box style={{ flex: 1, minHeight: 0 }}>
        <DataTable<ProfileGame>
          height="100%"
          withTableBorder
          borderRadius="md"
          highlightOnHover
          striped
          records={records}
          idAccessor="key"
          totalRecords={filtered.length}
          recordsPerPage={PAGE_SIZE}
          page={page}
          onPageChange={setPage}
          sortStatus={sortStatus}
          onSortStatusChange={(status) => {
            setSortStatus(status);
            setPage(1);
          }}
          selectedRecords={selected}
          onSelectedRecordsChange={setSelected}
          onRowDoubleClick={({ record }) => onOpenGame(record)}
          noRecordsText={t("Players.NoGamesInFilter", "No games match the current filters.")}
          paginationText={({ from, to, totalRecords }) => `${from}–${to} / ${totalRecords}`}
          columns={[
            {
              accessor: "day",
              title: t("Players.Games.Date", "Date"),
              sortable: true,
              width: 110,
              render: (game) => <Text size="sm">{formatDay(game.day)}</Text>,
            },
            {
              accessor: "opponent",
              title: t("Players.Games.Opponent", "Opponent"),
              sortable: true,
              render: (game) => (
                <Group gap="xs" wrap="nowrap">
                  <ColorDot white={game.isWhite} />
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {game.opponent || "?"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {game.opponentElo || "—"}
                    </Text>
                  </div>
                </Group>
              ),
            },
            {
              accessor: "outcome",
              title: t("Players.Games.Result", "Result"),
              width: 90,
              render: (game) => <ResultBadge game={game} />,
            },
            {
              accessor: "timeControlCategory",
              title: t("Players.Games.TimeControl", "Time"),
              width: 110,
              render: (game) => (
                <Text size="sm" title={game.timeControl ?? undefined}>
                  {timeControlLabel(game.timeControlCategory, t)}
                </Text>
              ),
            },
            {
              accessor: "opening",
              title: t("Players.Games.Opening", "Opening"),
              sortable: true,
              render: (game) => (
                <Text size="sm" lineClamp={1} title={game.opening ?? undefined}>
                  {game.opening || game.eco || "—"}
                </Text>
              ),
            },
            {
              accessor: "plies",
              title: t("Players.Games.Moves", "Moves"),
              sortable: true,
              width: 80,
              textAlign: "right",
              render: (game) => Math.ceil(game.plies / 2),
            },
            {
              accessor: "key",
              title: "",
              width: 70,
              textAlign: "right",
              render: (game) => (
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  {analyzedKeys.has(game.key) && (
                    <Tooltip label={t("Players.Games.Analyzed", "Analyzed with the engine")}>
                      <IconCpu size={14} color="var(--mantine-color-violet-5)" />
                    </Tooltip>
                  )}
                  <Tooltip label={t("Players.Games.Open", "Open on the board")}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenGame(game);
                      }}
                    >
                      <IconExternalLink size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ),
            },
          ]}
        />
      </Box>
    </Stack>
  );
}
