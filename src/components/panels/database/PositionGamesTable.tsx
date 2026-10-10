import { Alert, Group, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { DataTable } from "mantine-datatable";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import {
  commands,
  type NormalizedGame,
  type PositionGameSort,
  type PositionSummary,
  type SortDirection,
} from "@/bindings";
import { activeTabAtom, positionGamesViewFamily, tabsAtom } from "@/state/atoms";
import { isTransientPositionError } from "@/utils/db";
import { createTab } from "@/utils/tabs";
import type { ReferencePreview } from "./ReferenceGamePreview";

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
  const [view, setView] = useAtom(positionGamesViewFamily(owner));
  const page = view.token === snapshot.token ? view.page : 1;
  const offset = (page - 1) * 20;
  const [opening, setOpening] = useState(false);
  const sort: PositionGameSort = view.sort;
  const direction: SortDirection = view.direction;
  const [openError, setOpenError] = useState(false);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["position-page", snapshot.token, offset, sort, direction, owner],
    async ([, token, start, order, orderDirection]) => {
      if (order === "index") await commands.cancelPositionSearch(`games-sort:${owner}`);
      const result = await commands.getPositionGames(
        token,
        start,
        20,
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

  async function loadGame(index: number) {
    const selected = data?.[index];
    if (!selected) return null;
    const result = await commands.getPositionGame(snapshot.token, selected.snapshotOffset);
    if (result.status === "error") {
      if (result.error === "Position query expired") {
        onExpired();
        return null;
      }
      throw new Error(result.error);
    }
    return result.data;
  }

  async function openGame(game: NormalizedGame, ply: number) {
    await createTab({
      tab: {
        name: `${game.white} - ${game.black}`,
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
    navigate({ to: "/" });
  }

  async function handleRow(index: number, action: "preview" | "open") {
    if (opening) return;
    setOpening(true);
    try {
      const loaded = await loadGame(index);
      if (!loaded) return;
      const { game, ply } = loaded;
      if (action === "preview" && onSelect) {
        onSelect({ game, ply, open: () => void openGame(game, ply) });
      } else {
        await openGame(game, ply);
      }
    } catch {
      setOpenError(true);
    } finally {
      setOpening(false);
    }
  }

  if ((error && !transientError && !expired) || openError) {
    return <Alert color="red">{t("Board.Database.QueryFailed")}</Alert>;
  }
  return (
    <Stack gap={4} h="100%" style={{ minHeight: 0 }}>
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
            setView({ token: snapshot.token, page: 1, sort: value as PositionGameSort, direction })
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
      <DataTable
        withTableBorder
        highlightOnHover
        height="100%"
        verticalSpacing={4}
        fz="sm"
        rowBackgroundColor={(row) =>
          row.id === selectedId ? "var(--mantine-primary-color-light)" : undefined
        }
        records={data ?? []}
        fetching={isLoading || isValidating || transientError || expired || opening}
        totalRecords={snapshot.total}
        recordsPerPage={20}
        page={page}
        onPageChange={(next) => setView({ token: snapshot.token, page: next, sort, direction })}
        noRecordsText={t("Board.Database.NoGames")}
        onRowClick={({ index }) => void handleRow(index, onSelect ? "preview" : "open")}
        onRowDoubleClick={({ index }) => void handleRow(index, "open")}
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
