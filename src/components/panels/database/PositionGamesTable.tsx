import { ActionIcon, Alert, Group, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBooks,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCopy,
  IconDeviceFloppy,
  IconLink,
  IconSelectAll,
  IconX,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useAtom, useSetAtom } from "jotai";
import { type ContextMenuItemOptions, useContextMenu } from "mantine-contextmenu";
import { DataTable } from "mantine-datatable";
import { type MouseEvent, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import {
  commands,
  type NormalizedGame,
  type PositionGame,
  type PositionGameMetadata,
  type PositionGameSort,
  type PositionSummary,
  type SortDirection,
} from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import AddToStudyModal from "@/components/studies/AddToStudyModal";
import { activeTabAtom, positionGamesViewFamily, tabsAtom } from "@/state/atoms";
import { getPGN, parsePGN } from "@/utils/chess";
import { isTransientPositionError } from "@/utils/db";
import { appendGameLink, gameLinkFor, gameLinkLabel, gameLinkMarkdown } from "@/utils/gameLinks";
import { createTab } from "@/utils/tabs";
import type { ReferencePreview } from "./ReferenceGamePreview";

const PAGE_SIZE = 20;

/** Full PGN of a database game, headers included. */
async function databaseGamePgn(game: NormalizedGame) {
  const tree = await parsePGN(game.moves, game.fen);
  return getPGN(tree.root, {
    headers: game,
    glyphs: true,
    comments: true,
    variations: true,
    extraMarkups: true,
  });
}

const gameTitle = (game: NormalizedGame) => `${game.white} - ${game.black}`;

export default function PositionGamesTable({
  snapshot,
  databasePath,
  onExpired,
  owner,
  selectedId,
  onSelect,
}: {
  snapshot: PositionSummary;
  databasePath: string;
  onExpired: () => void;
  owner: string;
  selectedId?: number | null;
  /** Click previews a game; double click still opens it. */
  onSelect?: (preview: ReferencePreview) => void;
}) {
  const { t } = useTranslation();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const navigate = useNavigate();
  const { showContextMenu } = useContextMenu();
  // The analysis tab's game, whose current move can receive links to these games.
  const treeStore = useContext(TreeStateContext);
  const [view, setView] = useAtom(positionGamesViewFamily(owner));
  const page = view.token === snapshot.token ? view.page : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(snapshot.total / PAGE_SIZE));
  const [opening, setOpening] = useState(false);
  const sort: PositionGameSort = view.sort;
  const direction: SortDirection = view.direction;
  const [openError, setOpenError] = useState(false);
  // Selected rows by snapshot offset, kept across pages like a file explorer's selection.
  const [selection, setSelection] = useState<Map<number, PositionGameMetadata>>(new Map());
  const anchor = useRef<number | null>(null);
  const [studyTarget, setStudyTarget] = useState<{ title: string; pgn: string }[] | null>(null);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["position-page", snapshot.token, offset, sort, direction, owner],
    async ([, token, start, order, orderDirection]) => {
      if (order === "index") await commands.cancelPositionSearch(`games-sort:${owner}`);
      const result = await commands.getPositionGames(
        token,
        start,
        PAGE_SIZE,
        order,
        orderDirection,
        `games-sort:${owner}`,
      );
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
    { shouldRetryOnError: false, revalidateOnFocus: false, keepPreviousData: true },
  );
  const expired = error?.message === "Position query expired";
  const transientError = isTransientPositionError(error);
  const refreshed = useRef<string | null>(null);
  const retried = useRef<string | null>(null);
  useEffect(() => {
    setOpenError(false);
  }, [snapshot.token]);
  // Offsets only mean something within one query and one ordering.
  useEffect(() => {
    setSelection(new Map());
    anchor.current = null;
  }, [snapshot.token, sort, direction]);
  useEffect(
    () => () => {
      void commands.cancelPositionSearch(`games-sort:${owner}`);
    },
    [owner],
  );
  useEffect(() => {
    if (expired && refreshed.current !== snapshot.token) {
      refreshed.current = snapshot.token;
      onExpired();
    }
  }, [expired, snapshot.token, onExpired]);
  useEffect(() => {
    const retryKey = `${snapshot.token}:${offset}:${sort}:${direction}`;
    if (transientError && retried.current !== retryKey) {
      retried.current = retryKey;
      void mutate();
    }
  }, [transientError, snapshot.token, offset, sort, direction, mutate]);

  async function loadGame(row: PositionGameMetadata): Promise<PositionGame | null> {
    const result = await commands.getPositionGame(snapshot.token, row.snapshotOffset);
    if (result.status === "error") {
      if (result.error === "Position query expired") {
        onExpired();
        return null;
      }
      throw new Error(result.error);
    }
    return result.data;
  }

  async function loadGames(rows: PositionGameMetadata[]) {
    const games: PositionGame[] = [];
    for (const row of rows) {
      const loaded = await loadGame(row);
      if (!loaded) return null;
      games.push(loaded);
    }
    return games;
  }

  async function openTab(game: NormalizedGame, ply: number) {
    await createTab({
      tab: {
        name: gameTitle(game),
        type: "analysis",
        returnTabId: owner,
        returnTabView: "games",
      },
      setTabs,
      setActiveTab,
      pgn: game.moves,
      headers: game,
      position: Array(ply).fill(0),
      gameOrigin: { kind: "database", database: databasePath, gameId: game.id },
    });
  }

  async function openGame(game: NormalizedGame, ply: number) {
    await openTab(game, ply);
    navigate({ to: "/" });
  }

  /** Runs a (possibly multi-game) action with the shared loading and error handling. */
  async function withGames(
    rows: PositionGameMetadata[],
    action: (games: PositionGame[]) => Promise<void> | void,
  ) {
    if (opening) return;
    setOpening(true);
    try {
      const games = await loadGames(rows);
      if (games) await action(games);
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  }

  function handleRow(row: PositionGameMetadata, action: "preview" | "open") {
    void withGames([row], async ([{ game, ply }]) => {
      if (action === "preview" && onSelect) {
        onSelect({ game, ply, open: () => void openGame(game, ply) });
      } else {
        await openGame(game, ply);
      }
    });
  }

  function toggleSelected(row: PositionGameMetadata) {
    setSelection((current) => {
      const next = new Map(current);
      if (next.has(row.snapshotOffset)) next.delete(row.snapshotOffset);
      else next.set(row.snapshotOffset, row);
      return next;
    });
    anchor.current = row.snapshotOffset;
  }

  function handleClick(row: PositionGameMetadata, index: number, event: MouseEvent) {
    if (event.ctrlKey || event.metaKey) {
      toggleSelected(row);
      return;
    }
    const anchorIndex = data?.findIndex((r) => r.snapshotOffset === anchor.current) ?? -1;
    if (event.shiftKey && data && anchorIndex >= 0) {
      const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
      setSelection((current) => {
        const next = new Map(current);
        for (const r of data.slice(from, to + 1)) next.set(r.snapshotOffset, r);
        return next;
      });
      return;
    }
    setSelection(new Map([[row.snapshotOffset, row]]));
    anchor.current = row.snapshotOffset;
    handleRow(row, onSelect ? "preview" : "open");
  }

  function handleContextMenu(row: PositionGameMetadata, event: MouseEvent) {
    event.preventDefault();
    // Ctrl + right click adds games to the selection, like Ctrl + click in a file explorer.
    if (event.ctrlKey || event.metaKey) {
      toggleSelected(row);
      return;
    }
    let targets: PositionGameMetadata[];
    if (selection.has(row.snapshotOffset)) {
      targets = [...selection.values()];
    } else {
      targets = [row];
      setSelection(new Map([[row.snapshotOffset, row]]));
      anchor.current = row.snapshotOffset;
    }
    const count = targets.length;
    const header: ContextMenuItemOptions[] =
      count > 1
        ? [
            {
              key: "count",
              icon: <IconSelectAll size={16} />,
              title: t("Board.Database.Selection.Count", { count }),
              disabled: true,
              onClick: () => {},
            },
            { key: "count-divider" },
          ]
        : [];
    const footer: ContextMenuItemOptions[] =
      count > 1
        ? [
            { key: "clear-divider" },
            {
              key: "clear",
              icon: <IconX size={16} />,
              title: t("Board.Database.Selection.Clear"),
              onClick: () => setSelection(new Map()),
            },
          ]
        : [];
    showContextMenu([
      ...header,
      {
        key: "open",
        icon: <IconZoomCheck size={16} />,
        title: t("Board.Database.Selection.Open"),
        onClick: () =>
          void withGames(targets, async (games) => {
            for (const { game, ply } of games) await openTab(game, ply);
            navigate({ to: "/" });
          }),
      },
      {
        key: "study",
        icon: <IconBooks size={16} />,
        title: t("Board.Database.Selection.AddToStudy"),
        onClick: () =>
          void withGames(targets, async (games) => {
            setStudyTarget(
              await Promise.all(
                games.map(async ({ game }) => ({
                  title: gameTitle(game),
                  pgn: await databaseGamePgn(game),
                })),
              ),
            );
          }),
      },
      ...(treeStore
        ? [
            {
              key: "link",
              icon: <IconLink size={16} />,
              title: t("GameLink.InsertInComment"),
              onClick: () =>
                void withGames(targets, (games) => {
                  const state = treeStore.getState();
                  const comment = games.reduce(
                    (text, { game, ply }) =>
                      appendGameLink(
                        text,
                        gameLinkMarkdown(gameLinkLabel(game), gameLinkFor(game, databasePath, ply)),
                      ),
                    state.currentNode().comment,
                  );
                  state.setComment(comment);
                  notifications.show({ message: t("GameLink.Inserted") });
                }),
            },
          ]
        : []),
      {
        key: "copy-link",
        icon: <IconLink size={16} />,
        title: t("GameLink.Copy"),
        onClick: () =>
          void withGames(targets, async (games) => {
            const links = games.map(({ game, ply }) =>
              gameLinkMarkdown(gameLinkLabel(game), gameLinkFor(game, databasePath, ply)),
            );
            await navigator.clipboard.writeText(links.join("\n\n"));
            notifications.show({ message: t("GameLink.Copied") });
          }),
      },
      {
        key: "copy",
        icon: <IconCopy size={16} />,
        title: t("Board.Database.Selection.CopyPgn"),
        onClick: () =>
          void withGames(targets, async (games) => {
            const pgns = await Promise.all(games.map(({ game }) => databaseGamePgn(game)));
            await navigator.clipboard.writeText(pgns.join("\n\n"));
            notifications.show({ message: t("Board.Database.Selection.Copied") });
          }),
      },
      {
        key: "save",
        icon: <IconDeviceFloppy size={16} />,
        title: t("Board.Database.Selection.SavePgn"),
        onClick: () =>
          void withGames(targets, async (games) => {
            const destination = await save({
              defaultPath: count === 1 ? `${gameTitle(games[0].game)}.pgn` : "games.pgn",
              filters: [{ name: "PGN", extensions: ["pgn"] }],
            });
            if (!destination) return;
            const pgns = await Promise.all(games.map(({ game }) => databaseGamePgn(game)));
            await writeTextFile(destination, `${pgns.join("\n\n")}\n`);
            notifications.show({ message: t("Board.Database.Selection.Saved") });
          }),
      },
      ...footer,
    ])(event);
  }

  if ((error && !transientError && !expired) || openError) {
    return <Alert color="red">{t("Board.Database.QueryFailed")}</Alert>;
  }
  const goToPage = (next: number) =>
    setView({
      token: snapshot.token,
      page: Math.min(totalPages, Math.max(1, next)),
      sort,
      direction,
    });
  const firstShown = snapshot.total === 0 ? 0 : offset + 1;
  const lastShown = Math.min(snapshot.total, offset + PAGE_SIZE);
  return (
    <Stack gap={4} h="100%" style={{ minHeight: 0 }}>
      {studyTarget && (
        <AddToStudyModal
          opened
          onClose={() => setStudyTarget(null)}
          pgn={studyTarget.length === 1 ? studyTarget[0].pgn : ""}
          suggestedTitle={studyTarget.length === 1 ? studyTarget[0].title : ""}
          sourceLabel={databasePath}
          games={studyTarget.length === 1 ? undefined : studyTarget}
        />
      )}
      <Group gap={4} justify="space-between" wrap="wrap">
        <Group gap="xs" wrap="nowrap" title={t("Board.Database.SortScope")}>
          <Text size="xs" c="dimmed">
            {t("Board.Database.SortBy")}
          </Text>
          <Select
            size="xs"
            w={150}
            aria-label={t("Board.Database.SortBy")}
            value={sort}
            onChange={(value) =>
              setView({
                token: snapshot.token,
                page: 1,
                sort: value as PositionGameSort,
                direction,
              })
            }
            data={[
              { value: "index", label: t("Board.Database.Sort.Index") },
              { value: "date", label: t("Board.Database.Sort.Date") },
              { value: "averageElo", label: t("Board.Database.Sort.AverageElo") },
              { value: "whiteElo", label: t("Board.Database.Sort.WhiteElo") },
              { value: "blackElo", label: t("Board.Database.Sort.BlackElo") },
            ]}
          />
          <SegmentedControl
            size="xs"
            value={direction}
            onChange={(value) =>
              setView({ token: snapshot.token, page: 1, sort, direction: value as SortDirection })
            }
            data={[
              { value: "asc", label: t("Board.Database.Sort.Asc") },
              { value: "desc", label: t("Board.Database.Sort.Desc") },
            ]}
          />
        </Group>
        <Group gap={2} wrap="nowrap" ml="auto">
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={t("Board.Database.FirstPage")}
            disabled={page <= 1}
            onClick={() => goToPage(1)}
          >
            <IconChevronsLeft size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={t("Board.Database.PreviousPage")}
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Text size="xs" c="dimmed" px={4} style={{ whiteSpace: "nowrap" }}>
            {t("Board.Database.PageRange", {
              from: firstShown,
              to: lastShown,
              total: snapshot.total,
            })}
          </Text>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={t("Board.Database.NextPage")}
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
          >
            <IconChevronRight size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="sm"
            aria-label={t("Board.Database.LastPage")}
            disabled={page >= totalPages}
            onClick={() => goToPage(totalPages)}
          >
            <IconChevronsRight size={16} />
          </ActionIcon>
        </Group>
      </Group>
      <DataTable
        withTableBorder
        highlightOnHover
        height="100%"
        verticalSpacing={4}
        fz="sm"
        textSelectionDisabled
        rowBackgroundColor={(row) =>
          selection.has(row.snapshotOffset) || row.id === selectedId
            ? "var(--mantine-primary-color-light)"
            : undefined
        }
        records={data ?? []}
        fetching={isLoading || isValidating || transientError || expired || opening}
        noRecordsText={t("Board.Database.NoGames")}
        onRowClick={({ record, index, event }) => handleClick(record, index, event)}
        onRowDoubleClick={({ record }) => handleRow(record, "open")}
        onRowContextMenu={({ record, event }) => handleContextMenu(record, event)}
        columns={[
          {
            accessor: "white",
            title: t("Fen.White"),
            render: (g) => `${g.white} (${g.whiteElo || "—"})`,
          },
          {
            accessor: "black",
            title: t("Fen.Black"),
            render: (g) => `${g.black} (${g.blackElo || "—"})`,
          },
          { accessor: "date", title: t("Board.Database.Date") },
          { accessor: "result", title: t("Board.Database.Local.Result") },
          { accessor: "event", title: t("Board.Database.Event") },
          { accessor: "nextMove", title: t("Board.Database.Continuation") },
        ]}
      />
    </Stack>
  );
}
