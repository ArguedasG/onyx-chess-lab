import {
  ActionIcon,
  Alert,
  Button,
  Collapse,
  Group,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconFilter, IconRefresh } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import { Link } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { memo, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr/immutable";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { commands, type NormalizedGame, type PositionSummary } from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import {
  currentDbTabAtom,
  currentDbTypeAtom,
  currentLocalOptionsAtom,
  currentTabAtom,
  lichessOptionsAtom,
  masterOptionsAtom,
  referenceDbAtom,
  sessionsAtom,
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
import NoDatabaseWarning from "./NoDatabaseWarning";
import OpeningsTable from "./OpeningsTable";
import OpeningReportPanel from "./OpeningReportPanel";
import RemoteOpeningReportPanel from "./RemoteOpeningReportPanel";
import ReferenceGamePreview, { type ReferencePreview } from "./ReferenceGamePreview";
import classes from "./DatabasePanel.module.css";
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
};

/** Which explorer sections are folded (true = folded). */
const databaseSectionsAtom = atomWithStorage("database-panel-sections", {
  reference: false,
  games: false,
});

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
  const explorerToken = sessions.find((session) => session.lichess?.accessToken)?.lichess
    ?.accessToken;
  const missingExplorerToken = db !== "local" && !explorerToken;

  const { data: databases } = useSWR(db === "local" ? "databases" : null, () => getDatabases());

  const dbSelectData = (databases ?? [])
    .filter((d) => d.type === "success")
    .map((d) => ({ value: d.file, label: d.title || d.filename }));

  useEffect(() => {
    if (db === "local") {
      setLocalOptions((q) => ({ ...q, fen: debouncedFen }));
    }
  }, [debouncedFen, setLocalOptions, setMasterOptions, setLichessOptions, db]);

  useEffect(() => {
    if (db === "local") {
      setLocalOptions((q) => ({ ...q, path: referenceDatabase }));
    }
  }, [referenceDatabase, setLocalOptions, db]);

  const dbType: DBType = match(db)
    .with("local", (v) => ({
      type: v,
      options: localOptions,
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
    !missingExplorerToken ? [dbType, tabId] : null,
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
  const grandTotal = openingData?.openings?.reduce(
    (acc, curr) => acc + curr.black + curr.white + curr.draw + (curr.unknown ?? 0),
    0,
  );

  // "stats", "games" and "options" were tabs; they all live in the explorer view now.
  const view = tabType === "report" ? "report" : "explorer";
  const reportDisabled = dbType.type === "local" && dbType.options.type !== "exact";
  const showReference = !(dbType.type === "local" && dbType.options.type === "partial");
  const [sections, setSections] = useAtom(databaseSectionsAtom);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [preview, setPreview] = useState<ReferencePreview | null>(null);

  // A preview belongs to the position and source it was picked from.
  useEffect(() => {
    setPreview(null);
  }, [debouncedFen, db, referenceDatabase]);

  // Coming back from a game opened from the list (or "see games" in the report) shows the games.
  useEffect(() => {
    if (tabType === "games") setSections((current) => ({ ...current, games: false }));
  }, [tabType, setSections]);

  const toolbar = (
    <>
      <Group gap={6} wrap="wrap" mb={4}>
        <SegmentedControl
          size="xs"
          data={[
            { label: t("Board.Database.Local"), value: "local" },
            { label: t("Board.Database.LichessAll"), value: "lch_all" },
            { label: t("Board.Database.LichessMaster"), value: "lch_master" },
          ]}
          value={db}
          onChange={(value) => setDb(value as "local" | "lch_all" | "lch_master")}
        />
        {db === "local" && (
          <Select
            data={dbSelectData}
            value={referenceDatabase}
            onChange={async (value) => {
              await commands.clearGames();
              setReferenceDatabase(value);
            }}
            placeholder={t("Board.Database.SelectReference")}
            size="xs"
            w={180}
            allowDeselect={false}
          />
        )}
        {db === "local" && (
          <Button
            size="compact-xs"
            variant={localOptions.type === "pawns" ? "filled" : "default"}
            title={t(
              "Board.Database.Local.PawnStructure.Desc",
              "Find games that reached the same pawn structure, wherever the other pieces are.",
            )}
            onClick={() => {
              const pawns = localOptions.type !== "pawns";
              setLocalOptions((q) => ({
                ...q,
                type: pawns ? "pawns" : "exact",
                fen: debouncedFen,
              }));
              if (pawns && tabType === "report") setTabType("games");
            }}
          >
            {t("Board.Database.Local.PawnStructure", "Pawn structure")}
          </Button>
        )}
        <Button
          size="compact-xs"
          variant={filtersOpen ? "light" : "default"}
          leftSection={<IconFilter size={13} />}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {t("Board.Database.Filters", "Filters")}
        </Button>
        {db === "local" && (
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
        <div style={{ flex: 1 }} />
        <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
          {t("Board.Database.Matches", {
            matches: formatNumber(Math.max(grandTotal || 0, openingData?.games.length || 0)),
          })}
        </Text>
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(value) => setTabType(value === "report" ? "report" : "stats")}
          data={[
            { label: t("Board.Database.Explorer", "Explorer"), value: "explorer" },
            { label: t("OpeningReport.Tab"), value: "report", disabled: reportDisabled },
          ]}
        />
      </Group>
      <DatabaseLoader isLoading={isLoading} tab={tab?.value ?? null} />
      {!!openingData?.snapshot?.skippedGames && (
        <Alert color="yellow">
          {t("Board.Database.SkippedGames", { count: openingData.snapshot.skippedGames })}
        </Alert>
      )}
      <Collapse in={filtersOpen}>
        <ScrollArea.Autosize mah="40vh" offsetScrollbars className={classes.filters}>
          {match(db)
            .with("local", () => <LocalOptionsPanel boardFen={debouncedFen} />)
            .with("lch_all", () => <LichessOptionsPanel />)
            .with("lch_master", () => <MasterOptionsPanel />)
            .exhaustive()}
        </ScrollArea.Autosize>
      </Collapse>
    </>
  );

  const blocked = blockingMessage({
    type: db,
    referenceDatabase,
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

  const referenceOpen = showReference && !sections.reference;
  const gamesOpen = !sections.games;

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
      ) : (
        <div className={classes.sections}>
          {showReference && (
            <PanelSection
              title={t("Board.Database.Reference", "Reference")}
              collapsed={!referenceOpen}
              onToggle={() =>
                setSections((current) => ({ ...current, reference: !current.reference }))
              }
              flex={!referenceOpen ? "0 0 auto" : gamesOpen ? "0 0 42%" : "1 1 0"}
            >
              <OpeningsTable openings={openingData?.openings || []} loading={isLoading} />
            </PanelSection>
          )}
          <PanelSection
            title={t("Board.Database.Games")}
            collapsed={!gamesOpen}
            onToggle={() => setSections((current) => ({ ...current, games: !current.games }))}
            flex={gamesOpen ? "1 1 0" : "0 0 auto"}
          >
            <div className={classes.gamesTable}>{gamesTable}</div>
            {preview && (
              <ReferenceGamePreview
                preview={preview}
                currentFen={debouncedFen}
                onClose={() => setPreview(null)}
              />
            )}
          </PanelSection>
        </div>
      )}
    </Stack>
  );
}

/** A collapsible block of the explorer, separated by its header instead of a border. */
function PanelSection({
  title,
  collapsed,
  onToggle,
  flex,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  flex: string;
  children: React.ReactNode;
}) {
  return (
    <section className={classes.section} style={{ flex }}>
      <UnstyledButton
        className={classes.sectionHeader}
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <IconChevronDown
          size={14}
          className={classes.chevron}
          style={{ transform: collapsed ? "rotate(-90deg)" : undefined }}
        />
        {title}
      </UnstyledButton>
      {!collapsed && <div className={classes.sectionBody}>{children}</div>}
    </section>
  );
}

/** Why the source cannot be queried right now, if it cannot. */
function blockingMessage({
  type,
  referenceDatabase,
  missingExplorerToken,
  error,
  t,
}: {
  type: string;
  referenceDatabase: string | null;
  missingExplorerToken: boolean;
  error: unknown;
  t: (key: string) => string;
}) {
  if (error) return <Alert color="red">{t("Board.Database.QueryFailed")}</Alert>;
  if (type === "local" && !referenceDatabase) return <NoDatabaseWarning />;
  if (missingExplorerToken && type !== "local") {
    return (
      <Alert color="yellow">
        {t("Board.Database.ExplorerAuthRequired1")} <Link to="/accounts">Users</Link>{" "}
        {t("Board.Database.ExplorerAuthRequired2")}
      </Alert>
    );
  }
  return null;
}

export default memo(DatabasePanel);
