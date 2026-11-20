import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconChess,
  IconChessKnight,
  IconChevronDown,
  IconFilter,
  IconGridPattern,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { useAtom, useAtomValue } from "jotai";
import { memo, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr/immutable";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import {
  commands,
  type NormalizedGame,
  type PositionSummary,
  type WeakGamesFilter,
} from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import {
  activeWeakFilter,
  currentDbTabAtom,
  currentDbTypeAtom,
  currentLocalOptionsAtom,
  currentRivalBookAtom,
  currentTabAtom,
  type DbSourceType,
  lichessOptionsAtom,
  masterOptionsAtom,
  referenceDbAtom,
  sessionsAtom,
  weakGamesFilterAtom,
} from "@/state/atoms";
import { getDatabases, isTransientPositionError, type Opening, queryPosition } from "@/utils/db";
import PositionGamesTable from "./PositionGamesTable";
import { formatNumber } from "@/utils/format";
import {
  convertToNormalized,
  getLichessGames,
  getMasterGames,
  type RemoteOpeningData,
} from "@/utils/lichess/api";
import type { LichessGamesOptions, MasterGamesOptions } from "@/utils/lichess/explorer";
import DatabaseLoader from "./DatabaseLoader";
import GamesTable from "./GamesTable";
import NoDatabaseWarning, { LichessLoginRequired } from "./NoDatabaseWarning";
import OpeningsTable from "./OpeningsTable";
import PatternSearchModal from "./PatternSearchModal";
import PlansPanel from "./PlansPanel";
import OpeningReportPanel from "./OpeningReportPanel";
import RemoteOpeningReportPanel from "./RemoteOpeningReportPanel";
import ReferenceGamePreview, { type ReferencePreview } from "./ReferenceGamePreview";
import RivalExplorer from "./RivalExplorer";
import classes from "./DatabasePanel.module.css";
import { filterSummary } from "./filterSummary";
import { useSearchPartial } from "./useSearchPartial";
import LichessOptionsPanel from "./options/LichessOptionsPanel";
import LocalOptionsPanel from "./options/LocalOptionsPanel";
import MasterOptionsPanel from "./options/MastersOptionsPanel";

type DBType =
  | { type: "local"; options: LocalOptions }
  | {
      type: "lch_all";
      options: LichessGamesOptions;
      fen: string;
      token: string;
    }
  | {
      type: "lch_master";
      options: MasterGamesOptions;
      fen: string;
      token: string;
    };

export type LocalOptions = {
  path: string | null;
  fen: string;
  /** "pawns" matches the exact pawn structure and ignores every other piece. */
  type: "exact" | "partial" | "pawns";
  player: number | null;
  color: "white" | "black" | "any";
  elo_min?: number;
  elo_max?: number;
  start_date?: string;
  end_date?: string;
  result: "any" | "whitewon" | "draw" | "blackwon";
  /** Leaves out games between two weak players (a preference shared by every tab). */
  weak?: WeakGamesFilter | null;
  /** A "partial" search drawn in the pattern editor: its extra conditions. */
  pattern?: PatternOptions | null;
};

export type PatternOptions = {
  /** Squares that must be empty ("e4"). */
  empty: string[];
  turn: "white" | "black" | null;
  /** The board holds the drawn pieces and no other (kings always count as there). */
  exactMaterial: boolean;
};

function sortOpenings(openings: Opening[]) {
  return openings.sort(
    (a, b) =>
      b.black +
        b.draw +
        b.white +
        (b.unknown ?? 0) -
        (a.black + a.draw + a.white + (a.unknown ?? 0)) || a.move.localeCompare(b.move),
  );
}

async function fetchOpening(
  db: DBType,
  tab: string,
  signal?: AbortSignal,
): Promise<{
  openings: Opening[];
  games: NormalizedGame[];
  snapshot?: PositionSummary;
  remote?: RemoteOpeningData;
}> {
  return match(db)
    .with({ type: "lch_all" }, async ({ fen, options, token }) => {
      const data = await getLichessGames(fen, { ...options, history: true }, token, signal);
      return {
        openings: data.moves.map((move) => ({
          move: move.san,
          white: move.white,
          black: move.black,
          draw: move.draws,
        })),
        games: await convertToNormalized(data.topGames || data.recentGames || [], signal),
        remote: data,
      };
    })
    .with({ type: "lch_master" }, async ({ fen, options, token }) => {
      const data = await getMasterGames(fen, options, token, signal);
      return {
        openings: data.moves.map((move) => ({
          move: move.san,
          white: move.white,
          black: move.black,
          draw: move.draws,
        })),
        games: await convertToNormalized(data.topGames || data.recentGames || [], signal),
        remote: data,
      };
    })
    .with({ type: "local" }, async ({ options }) => {
      if (!options.path) throw Error("Missing reference database");
      const positionData = await queryPosition(options, tab, signal);
      return {
        openings: sortOpenings(positionData.openings),
        games: [],
        snapshot: positionData,
      };
    })
    .exhaustive();
}

function DatabasePanel() {
  const { t } = useTranslation();

  const store = useContext(TreeStateContext)!;
  const fen = useStore(store, (s) => s.currentNode().fen);
  const [referenceDatabase, setReferenceDatabase] = useAtom(referenceDbAtom);
  const sessions = useAtomValue(sessionsAtom);
  const [debouncedFen] = useDebouncedValue(fen, 50);
  const [lichessOptions, setLichessOptions] = useAtom(lichessOptionsAtom);
  const [masterOptions, setMasterOptions] = useAtom(masterOptionsAtom);
  const [localOptions, setLocalOptions] = useAtom(currentLocalOptionsAtom);
  const [db, setDb] = useAtom(currentDbTypeAtom);
  const rival = useAtomValue(currentRivalBookAtom);
  // The rival's book is read in memory; every query below runs on the other sources.
  const rivalActive = db === "rival" && rival != null;
  const source = db === "rival" ? "local" : db;
  const weakFilter = useAtomValue(weakGamesFilterAtom);
  const explorerToken = sessions.find((session) => session.lichess?.accessToken)?.lichess
    ?.accessToken;
  const missingExplorerToken = source !== "local" && !explorerToken;

  const { data: databases } = useSWR(source === "local" ? "databases" : null, () => getDatabases());

  const dbSelectData = (databases ?? [])
    .filter((d) => d.type === "success")
    .map((d) => ({ value: d.file, label: d.title || d.filename }));

  useEffect(() => {
    if (source === "local") {
      // A drawn pattern ("partial") is independent of the board: moving there must not erase it.
      setLocalOptions((q) => (q.type === "partial" ? q : { ...q, fen: debouncedFen }));
    }
  }, [debouncedFen, setLocalOptions, setMasterOptions, setLichessOptions, source]);

  useEffect(() => {
    if (source === "local") {
      setLocalOptions((q) => ({ ...q, path: referenceDatabase }));
    }
  }, [referenceDatabase, setLocalOptions, source]);

  const dbType: DBType = match(source)
    .with("local", (v) => ({
      type: v,
      options: { ...localOptions, weak: activeWeakFilter(weakFilter) },
    }))
    .with("lch_all", (v) => ({
      type: v,
      options: lichessOptions,
      fen: debouncedFen,
      token: explorerToken ?? "",
    }))
    .with("lch_master", (v) => ({
      type: v,
      options: masterOptions,
      fen: debouncedFen,
      token: explorerToken ?? "",
    }))
    .exhaustive();

  const tab = useAtomValue(currentTabAtom);
  const [tabType, setTabType] = useAtom(currentDbTabAtom);
  const tabId = tab?.value;
  const queryKey = JSON.stringify([dbType, tabId]);
  const activeQuery = useRef<{ key: string; controller: AbortController } | null>(null);

  useEffect(() => {
    return () => {
      activeQuery.current?.controller.abort();
    };
  }, []);

  useEffect(() => {
    const active = activeQuery.current;
    // Also cancel when SWR already has the new position cached and does not run its fetcher.
    // A fetcher for this render may have run already; never cancel that new controller.
    if (active && active.key !== queryKey) {
      active.controller.abort();
    }
  }, [queryKey]);

  const {
    data: openingData,
    isLoading: initialLoading,
    isValidating,
    error,
    mutate,
  } = useSWR(
    // Without a reference database there is nothing to query: the panel explains what to do.
    !missingExplorerToken && !rivalActive && !(source === "local" && !referenceDatabase)
      ? [dbType, tabId]
      : null,
    async ([source, owner]: [DBType, string | undefined]) => {
      activeQuery.current?.controller.abort();
      const controller = new AbortController();
      activeQuery.current = { key: JSON.stringify([source, owner]), controller };
      return fetchOpening(source, owner || "", controller.signal);
    },
    { keepPreviousData: true, shouldRetryOnError: false },
  );

  const transientError = isTransientPositionError(error);
  const retriedQuery = useRef<string | null>(null);
  useEffect(() => {
    if (transientError && retriedQuery.current !== queryKey) {
      retriedQuery.current = queryKey;
      void mutate();
    }
  }, [transientError, queryKey, mutate]);
  const isLoading = initialLoading || isValidating || transientError;
  // A long local search fills the panel as it goes instead of waiting for the end.
  const partial = useSearchPartial(tabId ?? null, queryKey, isLoading && source === "local");
  const grandTotal = openingData?.openings?.reduce(
    (acc, curr) => acc + curr.black + curr.white + curr.draw + (curr.unknown ?? 0),
    0,
  );

  const reportDisabled = dbType.type === "local" && dbType.options.type !== "exact";
  // A drawn pattern has no table of moves: what it finds are games.
  const showReference = !(dbType.type === "local" && dbType.options.type === "partial");
  // The moves table is stored as "stats", its old tab name ("options" was a tab too, long gone).
  // Plans read whole games of a local query (Lichess gives no games per position).
  // A pawn structure counts too (pieces by destination); a drawn pattern does not.
  const plansDisabled = dbType.type !== "local" || dbType.options.type === "partial";
  const view: "moves" | "games" | "plans" | "report" =
    tabType === "report" && !reportDisabled
      ? "report"
      : tabType === "plans" && !plansDisabled
        ? "plans"
        : tabType === "games" || !showReference
          ? "games"
          : "moves";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [patternOpen, setPatternOpen] = useState(false);
  const patternActive = source === "local" && localOptions.type === "partial";
  const [preview, setPreview] = useState<ReferencePreview | null>(null);

  // A preview belongs to the position and source it was picked from.
  useEffect(() => {
    setPreview(null);
  }, [debouncedFen, db, referenceDatabase]);

  const sourceControl = (
    <SegmentedControl
      size="xs"
      data={[
        ...(rival ? [{ label: t("Board.Database.Rival", "Rival"), value: "rival" }] : []),
        { label: t("Board.Database.Local"), value: "local" },
        { label: t("Board.Database.LichessAll"), value: "lch_all" },
        { label: t("Board.Database.LichessMaster"), value: "lch_master" },
      ]}
      value={rivalActive ? "rival" : source}
      onChange={(value) => setDb(value as DbSourceType)}
    />
  );

  const followBoard = () =>
    setLocalOptions((q) => ({ ...q, type: "exact", fen: debouncedFen, pattern: null }));
  const searchMode = localOptions.type;
  const searchModes = [
    {
      mode: "exact",
      icon: <IconChessKnight size={14} />,
      label: t("Board.Database.SearchBy.Position", "Board position"),
      description: t(
        "Board.Database.SearchBy.PositionDesc",
        "Games that reached the position on the board.",
      ),
      onClick: followBoard,
    },
    {
      mode: "pawns",
      icon: <IconChess size={14} />,
      label: t("Board.Database.Local.PawnStructure", "Pawn structure"),
      description: t(
        "Board.Database.Local.PawnStructure.Desc",
        "Find games that reached the same pawn structure, wherever the other pieces are.",
      ),
      onClick: () => {
        setLocalOptions((q) => ({ ...q, type: "pawns", fen: debouncedFen, pattern: null }));
        if (tabType === "report") setTabType("games");
      },
    },
    {
      mode: "partial",
      icon: <IconGridPattern size={14} />,
      label: t("PatternSearch.Button", "Pattern"),
      description: t(
        "PatternSearch.ButtonTip",
        "Find games where some pieces stood on some squares, whatever the rest of the board.",
      ),
      onClick: () => setPatternOpen(true),
    },
  ] as const;
  const currentSearch = searchModes.find((item) => item.mode === searchMode) ?? searchModes[0];

  const summary = filterSummary(
    source,
    { local: localOptions, lichess: lichessOptions, masters: masterOptions, weak: weakFilter },
    t,
  );

  const toolbar = (
    <>
      <Group gap={6} wrap="wrap" mb={6}>
        {sourceControl}
        {source === "local" && (
          <Select
            data={dbSelectData}
            value={referenceDatabase}
            onChange={async (value) => {
              await commands.clearGames();
              setReferenceDatabase(value);
            }}
            placeholder={t("Board.Database.ChooseReference")}
            size="xs"
            w={170}
            allowDeselect={false}
          />
        )}
        {source === "local" && (
          <Menu position="bottom-start" shadow="md" width={280}>
            <Menu.Target>
              <Button
                size="compact-xs"
                variant={searchMode === "exact" ? "default" : "light"}
                leftSection={currentSearch.icon}
                rightSection={<IconChevronDown size={12} />}
                title={t("Board.Database.SearchBy", "Search by")}
              >
                {currentSearch.label}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t("Board.Database.SearchBy", "Search by")}</Menu.Label>
              {searchModes.map((item) => (
                <Menu.Item
                  key={item.mode}
                  leftSection={item.icon}
                  rightSection={item.mode === searchMode ? <IconCheck size={14} /> : null}
                  onClick={item.onClick}
                >
                  <Text size="sm">{item.label}</Text>
                  <Text size="xs" c="dimmed">
                    {item.description}
                  </Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
        <Tooltip label={summary.join(" · ")} disabled={summary.length === 0} multiline maw={300}>
          <Button
            size="compact-xs"
            variant={filtersOpen || summary.length > 0 ? "light" : "default"}
            leftSection={<IconFilter size={13} />}
            maw={260}
            styles={{ inner: { minWidth: 0 }, label: { minWidth: 0, overflow: "hidden" } }}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {/* The label stays a centred flex box; only this span truncates. */}
            <span className={classes.ellipsis}>
              {summary.length > 0 ? summary.join(" · ") : t("Board.Database.Filters", "Filters")}
            </span>
          </Button>
        </Tooltip>
      </Group>
      <Group gap={6} wrap="nowrap" mb={4}>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(value) => setTabType(value === "moves" ? "stats" : value)}
          data={[
            {
              label: t("Board.Database.Moves", "Moves"),
              value: "moves",
              disabled: !showReference,
            },
            { label: t("Board.Database.Games"), value: "games" },
            { label: t("Board.Database.Plans", "Plans"), value: "plans", disabled: plansDisabled },
            { label: t("OpeningReport.Tab"), value: "report", disabled: reportDisabled },
          ]}
        />
        {patternActive && (
          <Tooltip
            label={t(
              "PatternSearch.Active.Desc",
              "The games list shows the drawn pattern, not the board position. Close it to follow the board again.",
            )}
            multiline
            w={260}
          >
            <Badge
              size="sm"
              variant="light"
              style={{ flexShrink: 0 }}
              rightSection={
                <IconX
                  size={11}
                  style={{ cursor: "pointer" }}
                  aria-label={t("PatternSearch.Close", "Back to the board position")}
                  onClick={followBoard}
                />
              }
            >
              {t("PatternSearch.Active", "Pattern search")}
            </Badge>
          </Tooltip>
        )}
        <div style={{ flex: 1 }} />
        <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
          {partial
            ? t("Board.Database.MatchesSoFar", "{{matches}} matches so far…", {
                matches: formatNumber(partial.matches),
              })
            : t("Board.Database.Matches", {
                matches: formatNumber(Math.max(grandTotal || 0, openingData?.games.length || 0)),
              })}
        </Text>
        {source === "local" && (
          <Tooltip label={t("Board.Database.Refresh")}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              loading={isLoading}
              onClick={() => {
                void mutate();
              }}
            >
              <IconRefresh size={15} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <PatternSearchModal
        opened={patternOpen}
        onClose={() => setPatternOpen(false)}
        boardFen={debouncedFen}
        initial={
          patternActive
            ? {
                fen: localOptions.fen,
                pattern: localOptions.pattern ?? { empty: [], turn: null, exactMaterial: false },
              }
            : null
        }
        onSearch={({ fen: patternFen, pattern }) => {
          setPatternOpen(false);
          setLocalOptions((q) => ({ ...q, type: "partial", fen: patternFen, pattern }));
          setTabType("games");
        }}
      />
      <DatabaseLoader isLoading={isLoading} tab={tab?.value ?? null} />
      {!!openingData?.snapshot?.skippedGames && (
        <Alert color="yellow">
          {t("Board.Database.SkippedGames", { count: openingData.snapshot.skippedGames })}
        </Alert>
      )}
      {!!openingData?.snapshot?.unlistedGames && (
        <Text size="xs" c="dimmed">
          {t(
            "Board.Database.UnlistedGames",
            "Very broad position: the move statistics include every game, but the game list and the report use the first {{listed}} ({{unlisted}} left out). Make a move or add a filter to see them all.",
            {
              listed: formatNumber(openingData.snapshot.total),
              unlisted: formatNumber(openingData.snapshot.unlistedGames),
            },
          )}
        </Text>
      )}
      {/* Sized by the panel, not the window: a short panel scrolls the filters to their end. */}
      {filtersOpen && (
        <ScrollArea.Autosize mah="60%" offsetScrollbars className={classes.filters}>
          {match(source)
            .with("local", () => <LocalOptionsPanel boardFen={debouncedFen} />)
            .with("lch_all", () => <LichessOptionsPanel />)
            .with("lch_master", () => <MasterOptionsPanel />)
            .exhaustive()}
        </ScrollArea.Autosize>
      )}
    </>
  );

  const blocked = blockingMessage({
    type: source,
    referenceDatabase,
    hasDatabases: dbSelectData.length > 0,
    missingExplorerToken,
    error: transientError ? undefined : error,
    t,
  });

  const gamesTable =
    dbType.type === "local" && openingData?.snapshot ? (
      <PositionGamesTable
        snapshot={openingData.snapshot}
        databasePath={dbType.options.path!}
        owner={tabId ?? ""}
        selectedId={preview?.game.id ?? null}
        onSelect={setPreview}
        onExpired={() => {
          void mutate();
        }}
      />
    ) : (
      <GamesTable
        games={openingData?.games || []}
        loading={isLoading}
        databasePath={dbType.type === "local" ? dbType.options.path : null}
        selectedId={preview?.game.id ?? null}
        onSelect={setPreview}
      />
    );

  if (rivalActive)
    return (
      <Stack h="100%" gap={4} px="sm" py="xs" style={{ overflow: "hidden" }}>
        <Group gap={6} wrap="wrap">
          {sourceControl}
        </Group>
        <RivalExplorer rival={rival} fen={debouncedFen} />
      </Stack>
    );

  return (
    <Stack h="100%" gap={0} px="sm" py="xs" style={{ overflow: "hidden" }}>
      {toolbar}
      {blocked ? (
        blocked
      ) : view === "report" ? (
        <ScrollArea
          data-testid="opening-report-scroll-area"
          flex={1}
          mih={0}
          offsetScrollbars
          type="auto"
        >
          {dbType.type !== "local" && openingData?.remote && !isLoading ? (
            <RemoteOpeningReportPanel
              key={`${dbType.type}:${dbType.fen}:${JSON.stringify(dbType.options)}`}
              data={openingData.remote}
              fen={dbType.fen}
              source={dbType.type === "lch_all" ? "Lichess" : "Lichess Masters"}
              onGames={() => setTabType("games")}
            />
          ) : dbType.type === "local" &&
            dbType.options.type === "exact" &&
            openingData?.snapshot &&
            !isLoading ? (
            <OpeningReportPanel
              key={`${openingData.snapshot.token}:${dbType.options.fen}`}
              snapshot={openingData.snapshot}
              displayFen={dbType.options.fen}
              databasePath={dbType.options.path!}
              owner={tabId ?? ""}
              onGames={() => setTabType("games")}
              onExpired={() => {
                void mutate();
              }}
            />
          ) : (
            <Text p="sm" c="dimmed">
              {t("OpeningReport.WaitForQuery")}
            </Text>
          )}
        </ScrollArea>
      ) : view === "plans" ? (
        dbType.type === "local" && openingData?.snapshot ? (
          <PlansPanel
            key={tabId}
            snapshot={openingData.snapshot}
            owner={tabId ?? ""}
            fen={dbType.options.fen}
            onExpired={() => {
              void mutate();
            }}
          />
        ) : (
          <Text p="sm" c="dimmed">
            {t("OpeningReport.WaitForQuery")}
          </Text>
        )
      ) : view === "moves" ? (
        <div className={classes.view}>
          {partial ? (
            <OpeningsTable openings={partial.openings} loading={false} />
          ) : (
            <OpeningsTable openings={openingData?.openings || []} loading={isLoading} />
          )}
        </div>
      ) : (
        <div className={classes.view}>
          <div className={classes.gamesTable}>{gamesTable}</div>
          {preview && (
            <ReferenceGamePreview
              preview={preview}
              currentFen={debouncedFen}
              onClose={() => setPreview(null)}
            />
          )}
        </div>
      )}
    </Stack>
  );
}

/** Why the source cannot be queried right now, if it cannot. */
function blockingMessage({
  type,
  referenceDatabase,
  hasDatabases,
  missingExplorerToken,
  error,
  t,
}: {
  type: string;
  referenceDatabase: string | null;
  hasDatabases: boolean;
  missingExplorerToken: boolean;
  error: unknown;
  t: (key: string) => string;
}) {
  if (type === "local" && !referenceDatabase) {
    return <NoDatabaseWarning hasDatabases={hasDatabases} />;
  }
  if (missingExplorerToken && type !== "local") return <LichessLoginRequired />;
  if (error) return <Alert color="red">{t("Board.Database.QueryFailed")}</Alert>;
  return null;
}

export default memo(DatabasePanel);
