import { ActionIcon, Box, Center, Collapse, Flex, Group, Stack, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { IconDotsVertical } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { DataTable } from "mantine-datatable";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { useStore } from "zustand";
import type { GameSort, NormalizedGame } from "@/bindings";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import GameFilters, { EloRangeInput } from "@/components/common/GameFilters";
import { query_games } from "@/utils/db";
import {
  EMPTY_GAME_FILTERS,
  eloFromRange,
  eloToRange,
  outcomeToResult,
  resultToOutcome,
} from "@/utils/gameFilters";
import { createTab } from "@/utils/tabs";
import { DatabaseViewStateContext } from "./DatabaseViewStateContext";
import GameCard from "./GameCard";
import GridLayout from "./GridLayout";
import { PlayerSearchInput } from "./PlayerSearchInput";
import { SideInput } from "./SideInput";
import classes from "./styles.module.css";

function GameTable() {
  const { t } = useTranslation();
  const store = useContext(DatabaseViewStateContext)!;

  const file = useStore(store, (s) => s.database?.file)!;
  const query = useStore(store, (s) => s.games.query);
  const setQuery = useStore(store, (s) => s.setGamesQuery);
  const openedSettings = useStore(store, (s) => s.games.isFilterExpanded);
  const toggleOpenedSettings = useStore(store, (s) => s.toggleGamesOpenedSettings);

  const selectedGame = useStore(store, (s) => s.games.selectedGame);
  const setSelectedGame = useStore(store, (s) => s.setGamesSelectedGame);

  const navigate = useNavigate();

  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const { data, error, isLoading, mutate } = useSWR(["games", file, query], () =>
    query_games(file, query),
  );

  const games = data?.data ?? [];
  const count = data?.count;

  useHotkeys([
    [
      "ArrowUp",
      () => {
        setSelectedGame(
          selectedGame === undefined || selectedGame === null
            ? undefined
            : selectedGame === 0
              ? 0
              : selectedGame - 1,
        );
      },
    ],
    [
      "ArrowDown",
      () => {
        setSelectedGame(
          selectedGame === undefined || selectedGame === null
            ? 0
            : selectedGame === games.length - 1
              ? games.length - 1
              : selectedGame + 1,
        );
      },
    ],
  ]);

  return (
    <GridLayout
      search={
        <Flex style={{ gap: 20 }}>
          <Box style={{ flexGrow: 1 }}>
            <Group grow>
              <PlayerSearchInput
                value={query?.player1 ?? undefined}
                setValue={(value) => setQuery({ ...query, player1: value })}
                rightSection={
                  <SideInput
                    sides={query.sides!}
                    setSides={(value) => setQuery({ ...query, sides: value })}
                    label="Player"
                  />
                }
                label={t("Common.Search")}
                file={file}
              />
              <PlayerSearchInput
                value={query?.player2 ?? undefined}
                setValue={(value) => setQuery({ ...query, player2: value })}
                rightSection={
                  <SideInput
                    sides={query.sides!}
                    setSides={(value) => setQuery({ ...query, sides: value })}
                    label="Opponent"
                  />
                }
                label={t("Common.Search")}
                file={file}
              />
            </Group>
            <Collapse in={openedSettings} mx={10}>
              <Stack mt="md">
                <Group grow align="flex-start">
                  <EloRangeInput
                    label={t("GameFilters.PlayerElo", "Player Elo")}
                    min={eloFromRange(query.range1).eloMin}
                    max={eloFromRange(query.range1).eloMax}
                    onChange={(min, max) => setQuery({ ...query, range1: eloToRange(min, max) })}
                  />
                  <EloRangeInput
                    label={t("GameFilters.OpponentElo", "Opponent Elo")}
                    min={eloFromRange(query.range2).eloMin}
                    max={eloFromRange(query.range2).eloMax}
                    onChange={(min, max) => setQuery({ ...query, range2: eloToRange(min, max) })}
                  />
                </Group>
                <GameFilters
                  fields={["result", "dates"]}
                  value={{
                    ...EMPTY_GAME_FILTERS,
                    result: outcomeToResult(query.outcome),
                    startDate: query.start_date ?? null,
                    endDate: query.end_date ?? null,
                  }}
                  onChange={(value) =>
                    setQuery({
                      ...query,
                      outcome: resultToOutcome(value.result),
                      start_date: value.startDate ?? undefined,
                      end_date: value.endDate ?? undefined,
                    })
                  }
                />
              </Stack>
            </Collapse>
          </Box>
          <ActionIcon style={{ flexGrow: 0 }} onClick={() => toggleOpenedSettings()}>
            <IconDotsVertical size="1rem" />
          </ActionIcon>
        </Flex>
      }
      table={
        <DataTable<NormalizedGame>
          withTableBorder
          highlightOnHover
          records={games}
          fetching={isLoading}
          onRowDoubleClick={({ record }) => {
            createTab({
              tab: {
                name: `${record.white} - ${record.black}`,
                type: "analysis",
              },
              setTabs,
              setActiveTab,
              pgn: record.moves,
              headers: record,
              gameOrigin: {
                kind: "database",
                database: file,
                gameId: record.id,
              },
            });
            navigate({ to: "/" });
          }}
          columns={[
            {
              accessor: "white",
              render: ({ white, white_elo }) => (
                <div>
                  <Text size="sm" fw={500}>
                    {white}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {white_elo === 0 ? "Unrated" : white_elo}
                  </Text>
                </div>
              ),
            },
            {
              accessor: "black",
              render: ({ black, black_elo }) => (
                <div>
                  <Text size="sm" fw={500}>
                    {black}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {black_elo === 0 ? "Unrated" : black_elo}
                  </Text>
                </div>
              ),
            },
            { accessor: "date", sortable: true },
            {
              accessor: "result",
              render: ({ result }) => result?.replaceAll("1/2", "½"),
            },
            { accessor: "ply_count", title: "Plies", sortable: true },
            { accessor: "event" },
            { accessor: "site" },
          ]}
          rowClassName={(_, i) => (i === selectedGame ? classes.selected : "")}
          noRecordsText={
            error
              ? `${t("Common.Error")}: ${error instanceof Error ? error.message : String(error)}`
              : "No games found"
          }
          totalRecords={count!}
          recordsPerPage={query.options?.pageSize ?? 25}
          page={query.options?.page ?? 1}
          onPageChange={(page) =>
            setQuery({
              ...query,
              options: {
                ...query.options!,
                page,
              },
            })
          }
          onRecordsPerPageChange={(value) =>
            setQuery({
              ...query,
              options: { ...query.options!, pageSize: value },
            })
          }
          sortStatus={{
            columnAccessor: query.options?.sort || "date",
            direction: query.options?.direction || "desc",
          }}
          onSortStatusChange={(value) =>
            setQuery({
              ...query,
              options: {
                ...query.options!,
                sort: value.columnAccessor as GameSort,
                direction: value.direction,
              },
            })
          }
          recordsPerPageOptions={[10, 25, 50]}
          onRowClick={({ index }) => {
            setSelectedGame(index);
          }}
        />
      }
      preview={
        selectedGame !== undefined && selectedGame !== null && games[selectedGame] ? (
          <GameCard game={games[selectedGame]} file={file} mutate={mutate} />
        ) : (
          <Center h="100%">
            <Text>{t("Databases.Game.NoSelection")}</Text>
          </Center>
        )
      }
    />
  );
}

export default GameTable;
