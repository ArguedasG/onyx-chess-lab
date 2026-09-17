import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChartDots,
  IconDownload,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnalysisArtifactDocument, EngineOption, GameMetadata, GoMode } from "@/bindings";
import { commands } from "@/bindings";
import { PlayerSearchInput } from "@/components/databases/PlayerSearchInput";
import AnalysisLibraryModal from "@/components/analysis/AnalysisLibraryModal";
import PlayerPeriodComparison from "./PlayerPeriodComparison";
import PlayerVerifiableInsights from "./PlayerVerifiableInsights";
import PlayerVersionComparison from "./PlayerVersionComparison";
import { activeTabAtom, enginesAtom, tabsAtom } from "@/state/atoms";
import {
  playerAnalysisAtom,
  playerAnalysisProfileId,
  playerAnalysisViewFamily,
  type PlayerAnalysisSection,
  type StoredPlayerAnalysis,
} from "@/state/playerAnalysis";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { getMainLine, parsePGN } from "@/utils/chess";
import type { LocalEngine } from "@/utils/engines";
import { isMaiaEngine } from "@/utils/humanBots";
import {
  aggregateEngineAnalysis,
  analyzePlayerGames,
  buildEngineGameMetrics,
  criticalPositionForPerspective,
  DEFAULT_PLAYER_ANALYSIS_FILTERS,
  getPlayerAnalysisTimeControl,
  PLAYER_ANALYSIS_SCHEMA_VERSION,
  PLAYER_ANALYSIS_TIME_CONTROLS,
  playerAnalysisTimeControlCounts,
  selectPlayerEngineGames,
  type PlayerAnalysisBucket,
  type PlayerAnalysisCriticalPosition,
  type PlayerAnalysisExercisePerspective,
  type PlayerAnalysisFilters,
  type PlayerAnalysisGame,
  type PlayerAnalysisReference,
  type PlayerAnalysisSource,
  type PlayerAnalysisTimeControl,
} from "@/utils/playerAnalysis";
import { savePlayerAnalysisExport } from "@/utils/playerAnalysisExport";
import { createTab } from "@/utils/tabs";
import {
  addTacticsExerciseToSet,
  addTacticsSet,
  type ParsedTrainingRecord,
} from "@/utils/trainingAreas";
import { treeIteratorMainLine } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";

const PAGE_SIZE = 250;
const PLAYER_GAMES_CACHE_LIMIT = 3;
const playerGamesCache = new Map<string, PlayerAnalysisGame[]>();
const playerGamesLoads = new Map<string, Promise<PlayerAnalysisGame[]>>();
const sourceGamesCache = new Map<string, PlayerAnalysisGame[]>();
const SOURCE_GAMES_CACHE_LIMIT = 6;

function cachePlayerGames(profileId: string, games: PlayerAnalysisGame[]) {
  playerGamesCache.delete(profileId);
  playerGamesCache.set(profileId, games);
  while (playerGamesCache.size > PLAYER_GAMES_CACHE_LIMIT) {
    const oldest = playerGamesCache.keys().next().value;
    if (oldest) playerGamesCache.delete(oldest);
  }
}

function formatScore(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function formatCp(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)} cp`;
}

function findingTitle(
  category: "opening" | "color" | "timeControl" | "rating" | "trend",
  subject: string,
  t: (key: string, fallback: string, options?: Record<string, unknown>) => string,
): string {
  const labels = {
    opening: ["PlayerAnalysis.FindingOpening", "Opening to review: {{subject}}"],
    color: ["PlayerAnalysis.FindingColor", "Results to review with {{subject}}"],
    timeControl: ["PlayerAnalysis.FindingTime", "Time control to review: {{subject}}"],
    rating: ["PlayerAnalysis.FindingRating", "Opponent group to review: {{subject}}"],
    trend: ["PlayerAnalysis.FindingTrend", "Trend to review: {{subject}}"],
  } as const;
  const [key, fallback] = labels[category];
  return t(key, fallback, { subject });
}

function priorityLabel(
  value: "high" | "medium" | "low",
  t: (key: string, fallback: string) => string,
): string {
  return {
    high: t("PlayerAnalysis.PriorityHigh", "High"),
    medium: t("PlayerAnalysis.PriorityMedium", "Medium"),
    low: t("PlayerAnalysis.PriorityLow", "Low"),
  }[value];
}

function phaseLabel(
  value: "opening" | "middlegame" | "endgame",
  t: (key: string, fallback: string) => string,
): string {
  return {
    opening: t("PlayerAnalysis.PhaseOpening", "Opening"),
    middlegame: t("PlayerAnalysis.PhaseMiddlegame", "Middlegame"),
    endgame: t("PlayerAnalysis.PhaseEndgame", "Endgame"),
  }[value];
}

function classificationLabel(
  value: "inaccuracy" | "mistake" | "blunder",
  t: (key: string, fallback: string) => string,
): string {
  return {
    inaccuracy: t("PlayerAnalysis.Inaccuracy", "Inaccuracy"),
    mistake: t("PlayerAnalysis.Mistake", "Mistake"),
    blunder: t("PlayerAnalysis.Blunder", "Blunder"),
  }[value];
}

function timeControlLabel(
  value: PlayerAnalysisTimeControl,
  t: (key: string, fallback: string) => string,
): string {
  return {
    ultra_bullet: t("TimeControl.UltraBullet", "Ultra bullet"),
    bullet: t("TimeControl.Bullet", "Bullet"),
    blitz: t("TimeControl.Blitz", "Blitz"),
    rapid: t("TimeControl.Rapid", "Rapid"),
    classical: t("TimeControl.Classical", "Classical"),
    correspondence: t("TimeControl.Correspondence", "Correspondence"),
    daily: t("PlayerAnalysis.TimeDaily", "Daily"),
    unknown: t("PlayerAnalysis.TimeUnknown", "Unknown"),
  }[value];
}

async function loadSourceGames(source: PlayerAnalysisSource): Promise<PlayerAnalysisGame[]> {
  const sourceKey = `${source.databasePath}:${source.playerId}`;
  const cached = sourceGamesCache.get(sourceKey) ?? [];
  const checkpoint = cached.reduce((maximum, item) => Math.max(maximum, item.game.id), 0);
  const games: GameMetadata[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (games.length < total) {
    const response = unwrap(
      await commands.getGameMetadata(source.databasePath, {
        player1: source.playerId,
        sides: "Any",
        after_game_id: cached.length ? checkpoint : undefined,
        options: {
          page,
          pageSize: PAGE_SIZE,
          skipCount: cached.length > 0 || page > 1,
          sort: cached.length > 0 ? "id" : "date",
          direction: cached.length > 0 ? "asc" : "desc",
        },
      }),
    );
    games.push(...response.data);
    if (page === 1)
      total = response.count ?? (cached.length ? Number.POSITIVE_INFINITY : response.data.length);
    if (response.data.length < PAGE_SIZE) break;
    page += 1;
  }
  const loaded = games.map((game) => ({
    key: `${source.databasePath}:${game.id}`,
    source,
    game,
  }));
  const merged = [...new Map([...cached, ...loaded].map((item) => [item.key, item])).values()];
  sourceGamesCache.delete(sourceKey);
  sourceGamesCache.set(sourceKey, merged);
  while (sourceGamesCache.size > SOURCE_GAMES_CACHE_LIMIT) {
    const oldest = sourceGamesCache.keys().next().value;
    if (oldest) sourceGamesCache.delete(oldest);
    else break;
  }
  return merged;
}

async function loadProfileGames(
  sources: PlayerAnalysisSource[],
  onProgress?: (progress: number) => void,
): Promise<PlayerAnalysisGame[]> {
  const loaded: PlayerAnalysisGame[] = [];
  for (const [index, source] of sources.entries()) {
    loaded.push(...(await loadSourceGames(source)));
    onProgress?.(((index + 1) / sources.length) * 100);
  }
  return [...new Map(loaded.map((game) => [game.key, game])).values()];
}

function loadProfileGamesOnce(
  profileId: string,
  sources: PlayerAnalysisSource[],
): Promise<PlayerAnalysisGame[]> {
  const existing = playerGamesLoads.get(profileId);
  if (existing) return existing;
  const pending = loadProfileGames(sources)
    .then((games) => {
      cachePlayerGames(profileId, games);
      return games;
    })
    .finally(() => {
      if (playerGamesLoads.get(profileId) === pending) playerGamesLoads.delete(profileId);
    });
  playerGamesLoads.set(profileId, pending);
  return pending;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} fz="lg">
        {value}
      </Text>
    </Paper>
  );
}

function BucketTable({
  rows,
  label,
  onOpen,
}: {
  rows: PlayerAnalysisBucket[];
  label: string;
  onOpen: (reference: PlayerAnalysisReference) => void;
}) {
  const { t } = useTranslation();
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{label}</Table.Th>
          <Table.Th ta="right">{t("PlayerAnalysis.Games", "Games")}</Table.Th>
          <Table.Th ta="right">{t("PlayerAnalysis.Score", "Score")}</Table.Th>
          <Table.Th>{t("PlayerAnalysis.Record", "W-D-L")}</Table.Th>
          <Table.Th ta="right">{t("PlayerAnalysis.OpponentElo", "Opponent Elo")}</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.key}>
            <Table.Td>{row.key}</Table.Td>
            <Table.Td ta="right">{row.games}</Table.Td>
            <Table.Td ta="right">{formatScore(row.scorePercent)}</Table.Td>
            <Table.Td>{`${row.wins}-${row.draws}-${row.losses}`}</Table.Td>
            <Table.Td ta="right">{row.averageOpponentElo?.toFixed(0) ?? "—"}</Table.Td>
            <Table.Td ta="right">
              <Button
                size="compact-xs"
                variant="subtle"
                disabled={!row.references[0]}
                onClick={() => row.references[0] && onOpen(row.references[0])}
              >
                {t("PlayerAnalysis.Evidence", "Evidence")}
              </Button>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export default function PlayerAnalysisPanel({
  playerName,
  sources,
}: {
  playerName: string;
  sources: PlayerAnalysisSource[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const [state, setState] = useAtom(playerAnalysisAtom);
  const [trainingAreas, setTrainingAreas] = useAtom(trainingAreasAtom);
  const [engines] = useAtom(enginesAtom);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const profileId = useMemo(
    () => playerAnalysisProfileId(playerName, sources),
    [playerName, sources],
  );
  const [view, setView] = useAtom(playerAnalysisViewFamily(profileId));
  const summaryViewport = useRef<HTMLDivElement>(null);
  const openingsViewport = useRef<HTMLDivElement>(null);
  const findingsViewport = useRef<HTMLDivElement>(null);
  const engineViewport = useRef<HTMLDivElement>(null);
  const selectedScrollY = view.scrollY[view.section];
  const storedCandidate = state.profiles[profileId];
  const stored =
    storedCandidate?.schemaVersion === PLAYER_ANALYSIS_SCHEMA_VERSION ? storedCandidate : null;
  const [analysisSources, setAnalysisSources] = useState<PlayerAnalysisSource[]>(
    () => stored?.metadata.sources ?? sources,
  );
  const [games, setGames] = useState<PlayerAnalysisGame[]>([]);
  const [filters, setFilters] = useState<PlayerAnalysisFilters>(
    stored?.metadata.filters ?? DEFAULT_PLAYER_ANALYSIS_FILTERS,
  );
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [engineId, setEngineId] = useState("");
  const [engineGames, setEngineGames] = useState(10);
  const [analyzeAllGames, setAnalyzeAllGames] = useState(false);
  const [engineTimeMs, setEngineTimeMs] = useState(250);
  const [engineTimeControls, setEngineTimeControls] = useState<PlayerAnalysisTimeControl[]>(
    () => stored?.engine?.timeControls ?? [...PLAYER_ANALYSIS_TIME_CONTROLS],
  );
  const [engineLoading, setEngineLoading] = useState(false);
  const [versionSaving, setVersionSaving] = useState(false);
  const [aliasesOpened, setAliasesOpened] = useState(false);
  const [libraryOpened, setLibraryOpened] = useState(false);
  const [comparisonDocument, setComparisonDocument] = useState<AnalysisArtifactDocument | null>(
    null,
  );
  const [aliasDatabasePath, setAliasDatabasePath] = useState(sources[0]?.databasePath ?? "");
  const [aliasPlayerId, setAliasPlayerId] = useState<number | undefined>();
  const [engineProgress, setEngineProgress] = useState(0);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [pendingCritical, setPendingCritical] = useState<PlayerAnalysisCriticalPosition | null>(
    null,
  );
  const cancelled = useRef(false);
  const activeAnalysisId = useRef<string | null>(null);
  const loadRequestId = useRef(0);
  const profileSnapshot = useRef({
    sources: analysisSources,
    filters: stored?.metadata.filters,
    t,
  });
  profileSnapshot.current = { sources: analysisSources, filters: stored?.metadata.filters, t };
  const hasStoredProfile = stored !== null;

  useEffect(() => {
    const requestId = ++loadRequestId.current;
    const snapshot = profileSnapshot.current;
    setFilters(snapshot.filters ?? DEFAULT_PLAYER_ANALYSIS_FILTERS);
    const cached = playerGamesCache.get(profileId);
    if (cached) {
      cachePlayerGames(profileId, cached);
      setGames(cached);
      setLoading(false);
      return;
    }
    setGames([]);
    if (!hasStoredProfile || snapshot.sources.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadingProgress(0);
    void loadProfileGamesOnce(profileId, snapshot.sources)
      .then((loaded) => {
        if (loadRequestId.current !== requestId) return;
        setLoadingProgress(100);
        setGames(loaded);
      })
      .catch((error) => {
        if (loadRequestId.current !== requestId) return;
        notifications.show({
          color: "red",
          title: snapshot.t("PlayerAnalysis.Error", "Player analysis failed"),
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        if (loadRequestId.current === requestId) setLoading(false);
      });
    return () => {
      if (loadRequestId.current === requestId) loadRequestId.current += 1;
    };
  }, [hasStoredProfile, profileId]);

  useLayoutEffect(() => {
    const viewports: Record<PlayerAnalysisSection, React.RefObject<HTMLDivElement | null>> = {
      summary: summaryViewport,
      openings: openingsViewport,
      findings: findingsViewport,
      engine: engineViewport,
    };
    const viewport = viewports[view.section].current;
    if (viewport) viewport.scrollTop = selectedScrollY;
  }, [profileId, selectedScrollY, view.section]);

  const rememberScroll = useCallback(
    (section: PlayerAnalysisSection, y: number) => {
      setView((previous) =>
        previous.scrollY[section] === y
          ? previous
          : { ...previous, scrollY: { ...previous.scrollY, [section]: y } },
      );
    },
    [setView],
  );

  const localEngines = useMemo(
    () =>
      (engines ?? []).filter(
        (engine): engine is LocalEngine => engine.type === "local" && !isMaiaEngine(engine),
      ),
    [engines],
  );
  useEffect(() => {
    if (!localEngines.some((engine) => engine.id === engineId)) {
      setEngineId(localEngines[0]?.id ?? "");
    }
  }, [engineId, localEngines]);

  useEffect(() => {
    setEngineTimeControls(stored?.engine?.timeControls ?? [...PLAYER_ANALYSIS_TIME_CONTROLS]);
  }, [profileId, stored?.engine?.timeControls]);

  const userTacticsSets = useMemo(
    () =>
      Object.values(trainingAreas.tactics.sets).filter(
        (set) => set.origin === "user" && set.source?.kind !== "pgnFile",
      ),
    [trainingAreas.tactics.sets],
  );
  useEffect(() => {
    if (!userTacticsSets.some((set) => set.id === selectedSetId)) {
      setSelectedSetId(userTacticsSets[0]?.id ?? null);
    }
  }, [selectedSetId, userTacticsSets]);

  const engineTimeControlCounts = useMemo(
    () =>
      playerAnalysisTimeControlCounts(
        games,
        stored?.metadata.filters ?? DEFAULT_PLAYER_ANALYSIS_FILTERS,
      ),
    [games, stored?.metadata.filters],
  );
  const availableEngineTimeControls = useMemo(
    () => engineTimeControlCounts.map(({ value }) => value),
    [engineTimeControlCounts],
  );
  useEffect(() => {
    setEngineTimeControls((previous) => {
      if (availableEngineTimeControls.length === 0) return previous;
      const available = new Set(availableEngineTimeControls);
      const retained = previous.filter((value) => available.has(value));
      return retained.length > 0 ? retained : availableEngineTimeControls;
    });
  }, [availableEngineTimeControls]);
  const eligibleEngineGames = useMemo(
    () =>
      selectPlayerEngineGames(
        games,
        stored?.metadata.filters ?? DEFAULT_PLAYER_ANALYSIS_FILTERS,
        "all",
        engineTimeControls,
      ),
    [engineTimeControls, games, stored?.metadata.filters],
  );
  const engine = stored?.engine ?? null;

  const saveProfile = useCallback(
    (profile: StoredPlayerAnalysis) => {
      setState((previous) => ({
        ...previous,
        schemaVersion: PLAYER_ANALYSIS_SCHEMA_VERSION,
        profiles: { ...previous.profiles, [profileId]: profile },
      }));
    },
    [profileId, setState],
  );

  const generate = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    setLoadingProgress(0);
    try {
      const unique = await loadProfileGames(analysisSources, (progress) => {
        if (loadRequestId.current === requestId) setLoadingProgress(progress);
      });
      if (loadRequestId.current !== requestId) return;
      cachePlayerGames(profileId, unique);
      setGames(unique);
      const metadata = analyzePlayerGames(playerName, unique, analysisSources, filters);
      saveProfile({
        schemaVersion: PLAYER_ANALYSIS_SCHEMA_VERSION,
        profileId,
        playerName,
        updatedAt: metadata.generatedAt,
        metadata,
        engine: null,
      });
    } catch (error) {
      if (loadRequestId.current !== requestId) return;
      notifications.show({
        color: "red",
        title: t("PlayerAnalysis.Error", "Player analysis failed"),
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (loadRequestId.current === requestId) setLoading(false);
    }
  }, [analysisSources, filters, playerName, profileId, saveProfile, t]);

  const saveVersion = useCallback(async () => {
    if (!stored) return;
    setVersionSaving(true);
    try {
      const document = unwrap(
        await commands.saveAnalysisArtifact(
          "playerProfile",
          stored.artifactId ?? null,
          playerName,
          analysisSources.map((source) => source.databaseTitle).join(" · "),
          JSON.stringify(stored),
        ),
      );
      saveProfile({ ...stored, artifactId: document.summary.id });
      notifications.show({
        color: "green",
        message: t("PlayerAnalysis.VersionSaved", "Profile version saved."),
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setVersionSaving(false);
    }
  }, [analysisSources, playerName, saveProfile, stored, t]);

  const exportProfile = useCallback(
    async (format: "json" | "html") => {
      if (!stored) return;
      try {
        const saved = await savePlayerAnalysisExport(stored, format);
        if (saved) {
          notifications.show({
            color: "green",
            message: t("PlayerAnalysis.Exported", "Profile exported."),
          });
        }
      } catch (error) {
        notifications.show({
          color: "red",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [stored, t],
  );

  const openReference = useCallback(
    async (reference: PlayerAnalysisReference) => {
      try {
        const response = unwrap(
          await commands.getGames(reference.databasePath, {
            game_id: reference.gameId,
            options: {
              page: 1,
              pageSize: 1,
              skipCount: true,
              sort: "id",
              direction: "asc",
            },
          }),
        );
        const game = response.data[0];
        if (!game) throw new Error("Game not found");
        await createTab({
          tab: {
            name: `${game.white} - ${game.black}`,
            type: "analysis",
            returnPath: pathname === "/databases" ? "/databases" : "/accounts",
            returnPlayerAnalysis: { profileId, playerName },
          },
          setTabs,
          setActiveTab,
          pgn: game.moves,
          headers: game,
          position: Array(reference.ply ?? 0).fill(0),
          gameOrigin: {
            kind: "database",
            database: reference.databasePath,
            gameId: reference.gameId,
          },
          preserveNewTab: true,
        });
        navigate({ to: "/" });
      } catch (error) {
        notifications.show({
          color: "red",
          title: t("PlayerAnalysis.GameError", "Could not open the evidence game"),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [navigate, pathname, playerName, profileId, setActiveTab, setTabs, t],
  );

  const runEngineAnalysis = useCallback(async () => {
    const engine = localEngines.find((candidate) => candidate.id === engineId);
    if (!engine || !stored || games.length === 0) return;
    const selected = selectPlayerEngineGames(
      games,
      stored.metadata.filters,
      analyzeAllGames ? "all" : engineGames,
      engineTimeControls,
    );
    const options: EngineOption[] = (engine.settings ?? []).map((setting) => ({
      name: setting.name,
      value: setting.value == null ? "" : String(setting.value),
    }));
    const limit = `time:${engineTimeMs}ms`;
    const reusable =
      stored.engine?.engine.path === engine.path && stored.engine.engine.limit === limit
        ? new Map(stored.engine.games.map((game) => [game.key, game]))
        : new Map();
    const analyzed = selected.flatMap((game) =>
      reusable.has(game.key) ? [reusable.get(game.key)!] : [],
    );
    let skipped = 0;
    cancelled.current = false;
    setEngineLoading(true);
    setEngineProgress(selected.length ? (analyzed.length / selected.length) * 100 : 0);
    try {
      for (const item of selected) {
        if (cancelled.current || reusable.has(item.key)) continue;
        const analysisId = `player-analysis-${profileId}-${item.game.id}`;
        activeAnalysisId.current = analysisId;
        try {
          const gameResponse = unwrap(
            await commands.getGames(item.source.databasePath, {
              game_id: item.game.id,
              options: {
                page: 1,
                pageSize: 1,
                skipCount: true,
                sort: "id",
                direction: "asc",
              },
            }),
          );
          const hydratedGame = gameResponse.data[0];
          if (!hydratedGame) throw new Error("Game not found");
          const tree = await parsePGN(hydratedGame.moves, hydratedGame.fen);
          const uciMoves = getMainLine(tree.root);
          const nodes = [...treeIteratorMainLine(tree.root)].map((entry) => entry.node);
          const preMoveFens = nodes.slice(0, uciMoves.length + 1).map((node) => node.fen);
          const goMode: GoMode = { t: "Time", c: engineTimeMs };
          const response = await commands.analyzeGame(
            analysisId,
            engine.path,
            engine.args ?? [],
            goMode,
            {
              fen: hydratedGame.fen,
              moves: uciMoves,
              annotateNovelties: false,
              referenceDb: null,
              reversed: false,
            },
            options,
          );
          if (response.status === "error") throw new Error(response.error);
          const result = response.data;
          analyzed.push(
            buildEngineGameMetrics({
              item,
              uciMoves,
              preMoveFens,
              analysis: result,
              hasClockData: nodes.some((node) => node.clock !== undefined),
              clockSeconds: nodes.slice(1, uciMoves.length + 1).map((node) => node.clock ?? null),
            }),
          );
        } catch (error) {
          if (cancelled.current) break;
          skipped += 1;
          console.warn("Player analysis skipped a game", item.key, error);
        }
        setEngineProgress((analyzed.length / selected.length) * 100);
      }
      const result = aggregateEngineAnalysis({
        engine: {
          name: engine.name,
          path: engine.path,
          args: engine.args ?? [],
          options,
          limit,
        },
        requestedGames: selected.length,
        eligibleGames: eligibleEngineGames.length,
        timeControls: engineTimeControls,
        timeControlBreakdown: engineTimeControls.flatMap((value) => {
          const eligibleGames = eligibleEngineGames.filter(
            (game) => getPlayerAnalysisTimeControl(game) === value,
          ).length;
          const selectedKeys = new Set(
            selected
              .filter((game) => getPlayerAnalysisTimeControl(game) === value)
              .map((game) => game.key),
          );
          const analyzedGames = analyzed.filter((game) => selectedKeys.has(game.key)).length;
          return eligibleGames > 0 ? [{ value, eligibleGames, analyzedGames }] : [];
        }),
        skippedGames: skipped,
        games: analyzed,
      });
      saveProfile({ ...stored, updatedAt: result.analyzedAt, engine: result });
    } finally {
      activeAnalysisId.current = null;
      setEngineLoading(false);
    }
  }, [
    analyzeAllGames,
    engineGames,
    engineId,
    engineTimeMs,
    engineTimeControls,
    eligibleEngineGames,
    games,
    localEngines,
    profileId,
    saveProfile,
    stored,
  ]);

  const cancelEngine = useCallback(() => {
    cancelled.current = true;
    const id = activeAnalysisId.current;
    if (id) void commands.cancelAnalysis(id);
  }, []);

  const addCriticalToSet = useCallback(
    (critical: PlayerAnalysisCriticalPosition, perspective: PlayerAnalysisExercisePerspective) => {
      const exercise = criticalPositionForPerspective(critical, perspective);
      const record: ParsedTrainingRecord = {
        fen: exercise.fen,
        moves: exercise.moves,
        title: `${critical.gameLabel} · ${critical.classification}`,
        hasExplicitFen: true,
        playerAnalysis: {
          databasePath: critical.databasePath,
          gameId: critical.gameId,
          ply: exercise.ply,
          cpLoss: critical.cpLoss,
          classification: critical.classification,
          mode: exercise.mode,
          fen: exercise.fen,
          sideToMove: exercise.sideToMove,
          solution: exercise.moves,
        },
      };
      if (selectedSetId) {
        setTrainingAreas((previous) => ({
          ...previous,
          tactics: addTacticsExerciseToSet(previous.tactics, selectedSetId, record, [
            "player-analysis",
            exercise.mode,
            critical.classification,
            critical.phase,
          ]),
        }));
      } else {
        setTrainingAreas((previous) => ({
          ...previous,
          tactics: addTacticsSet(
            previous.tactics,
            t("PlayerAnalysis.ErrorSet", "My tactical errors"),
            t("PlayerAnalysis.ErrorSetDescription", "Positions added from Player Analysis."),
            [record],
          ),
        }));
      }
      notifications.show({
        color: "green",
        message: selectedSetId
          ? t("PlayerAnalysis.AddedToSet", "Position added to the tactical set.")
          : t("PlayerAnalysis.CreatedSet", "Tactical error set created."),
      });
    },
    [selectedSetId, setTrainingAreas, t],
  );

  const canonicalSourceKeys = useMemo(
    () => new Set(sources.map((source) => `${source.databasePath}:${source.playerId}`)),
    [sources],
  );
  const sourceDatabaseOptions = useMemo(
    () =>
      [...new Map(sources.map((source) => [source.databasePath, source])).values()].map(
        (source) => ({ value: source.databasePath, label: source.databaseTitle }),
      ),
    [sources],
  );
  const addAlias = useCallback(async () => {
    if (!aliasDatabasePath || aliasPlayerId == null) return;
    const template = sources.find((source) => source.databasePath === aliasDatabasePath);
    if (!template) return;
    try {
      const player = unwrap(await commands.getPlayer(aliasDatabasePath, aliasPlayerId));
      if (!player?.name) throw new Error("Player not found");
      const alias: PlayerAnalysisSource = {
        ...template,
        playerId: player.id,
        playerName: player.name,
      };
      setAnalysisSources((previous) =>
        previous.some(
          (source) =>
            source.databasePath === alias.databasePath && source.playerId === alias.playerId,
        )
          ? previous
          : [...previous, alias],
      );
      setAliasPlayerId(undefined);
      setAliasesOpened(false);
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [aliasDatabasePath, aliasPlayerId, sources]);

  if (!state.enabled) {
    return (
      <Stack p="sm">
        <Alert color="gray">
          {t("PlayerAnalysis.Disabled", "The local analytical profile is disabled.")}
        </Alert>
        <Button onClick={() => setState((previous) => ({ ...previous, enabled: true }))}>
          {t("PlayerAnalysis.Enable", "Enable Player Analysis")}
        </Button>
      </Stack>
    );
  }

  const metadata = stored?.metadata;
  const timeControls = [...new Set(games.map((game) => game.game.time_control || "unknown"))];

  return (
    <Stack h="100%" gap="sm" style={{ minHeight: 0 }}>
      <AnalysisLibraryModal
        opened={libraryOpened}
        onClose={() => setLibraryOpened(false)}
        onRestore={(document) => {
          try {
            const latest = document.versions.at(-1);
            if (!latest) throw new Error("Saved profile has no versions");
            const profile = JSON.parse(latest.payloadJson) as StoredPlayerAnalysis;
            if (
              profile.schemaVersion !== PLAYER_ANALYSIS_SCHEMA_VERSION ||
              profile.profileId !== profileId
            ) {
              throw new Error("This saved profile belongs to another player or schema version");
            }
            saveProfile({ ...profile, artifactId: document.summary.id });
            setAnalysisSources(profile.metadata.sources);
            setLibraryOpened(false);
          } catch (error) {
            notifications.show({
              color: "red",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }}
        onCompare={(document) => {
          setComparisonDocument(document);
          setLibraryOpened(false);
        }}
      />
      <Modal
        opened={comparisonDocument !== null}
        onClose={() => setComparisonDocument(null)}
        title={t("PlayerAnalysis.VersionComparison", "Saved version comparison")}
        size="xl"
        centered
      >
        {comparisonDocument && (
          <PlayerVersionComparison document={comparisonDocument} profileId={profileId} />
        )}
      </Modal>
      <Modal
        opened={aliasesOpened}
        onClose={() => setAliasesOpened(false)}
        title={t("PlayerAnalysis.Aliases", "Manual aliases")}
        centered
      >
        <Stack>
          <Alert color="blue">
            {t(
              "PlayerAnalysis.AliasScope",
              "Aliases only join player records you select inside a local database. Onyx never guesses identities or links online accounts to real names.",
            )}
          </Alert>
          <Select
            label={t("PlayerAnalysis.AliasDatabase", "Database")}
            data={sourceDatabaseOptions}
            value={aliasDatabasePath}
            allowDeselect={false}
            onChange={(value) => {
              setAliasDatabasePath(value ?? "");
              setAliasPlayerId(undefined);
            }}
          />
          {aliasDatabasePath && (
            <PlayerSearchInput
              label={t("PlayerAnalysis.AliasPlayer", "Search player")}
              file={aliasDatabasePath}
              value={aliasPlayerId}
              setValue={setAliasPlayerId}
            />
          )}
          <Button disabled={aliasPlayerId == null} onClick={() => void addAlias()}>
            {t("PlayerAnalysis.AddAlias", "Add selected alias")}
          </Button>
          {analysisSources.map((source) => {
            const key = `${source.databasePath}:${source.playerId}`;
            const canonical = canonicalSourceKeys.has(key);
            return (
              <Group key={key} justify="space-between" wrap="nowrap">
                <Text size="sm">
                  {source.playerName} · {source.databaseTitle}
                </Text>
                {!canonical && (
                  <Button
                    size="compact-xs"
                    color="red"
                    variant="subtle"
                    onClick={() =>
                      setAnalysisSources((previous) =>
                        previous.filter(
                          (candidate) => `${candidate.databasePath}:${candidate.playerId}` !== key,
                        ),
                      )
                    }
                  >
                    {t("Common.Remove", "Remove")}
                  </Button>
                )}
              </Group>
            );
          })}
        </Stack>
      </Modal>
      <Modal
        opened={pendingCritical !== null}
        onClose={() => setPendingCritical(null)}
        title={t("PlayerAnalysis.PerspectiveQuestion", "Choose the exercise perspective")}
        centered
      >
        {pendingCritical && (
          <Stack>
            <Text size="sm" c="dimmed">
              {t(
                "PlayerAnalysis.PerspectiveQuestionDescription",
                "Choose which side of this error you want to train. The selected perspective will be saved in the exercise.",
              )}
            </Text>
            <div>
              <Button
                fullWidth
                variant="light"
                disabled={pendingCritical.bestLine.length === 0}
                onClick={() => {
                  addCriticalToSet(pendingCritical, "improveDecision");
                  setPendingCritical(null);
                }}
              >
                {t("PlayerAnalysis.PerspectiveImprove", "Improve my decision")}
              </Button>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "PlayerAnalysis.PerspectiveImproveDescription",
                  "The exercise starts before your mistake and asks you to find the better decision.",
                )}
              </Text>
            </div>
            <div>
              <Button
                fullWidth
                variant="light"
                disabled={pendingCritical.punishmentLine.length === 0}
                onClick={() => {
                  addCriticalToSet(pendingCritical, "punishError");
                  setPendingCritical(null);
                }}
              >
                {t("PlayerAnalysis.PerspectivePunish", "Punish my error")}
              </Button>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "PlayerAnalysis.PerspectivePunishDescription",
                  "The exercise starts after your mistake and asks you to find the opponent's punishment.",
                )}
              </Text>
            </div>
          </Stack>
        )}
      </Modal>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={4}>{t("PlayerAnalysis.Title", "Player Analysis")}</Title>
          <Text size="xs" c="dimmed">
            {t(
              "PlayerAnalysis.Scope",
              "Local, versioned analysis. Every conclusion keeps its sample and evidence games.",
            )}
          </Text>
        </div>
        <Group gap="xs">
          <Button size="xs" variant="subtle" onClick={() => setLibraryOpened(true)}>
            {t("AnalysisLibrary.Title", "Analysis library")}
          </Button>
          <Button size="xs" variant="subtle" onClick={() => setAliasesOpened(true)}>
            {t("PlayerAnalysis.Aliases", "Manual aliases")}
          </Button>
          <Switch
            checked={state.enabled}
            label={t("PlayerAnalysis.LocalProfile", "Local profile")}
            onChange={(event) =>
              setState((previous) => ({ ...previous, enabled: event.currentTarget.checked }))
            }
          />
          <Button
            size="xs"
            variant="default"
            color="red"
            leftSection={<IconTrash size={14} />}
            disabled={!stored || loading || engineLoading}
            onClick={() => {
              playerGamesCache.delete(profileId);
              setState((previous) => {
                const profiles = { ...previous.profiles };
                delete profiles[profileId];
                return { ...previous, profiles };
              });
            }}
          >
            {t("PlayerAnalysis.Delete", "Delete profile")}
          </Button>
          {stored && (
            <Button
              variant="default"
              loading={versionSaving}
              disabled={loading || engineLoading}
              onClick={() => void saveVersion()}
            >
              {t("PlayerAnalysis.SaveVersion", "Save version")}
            </Button>
          )}
          {stored && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button size="xs" variant="default" leftSection={<IconDownload size={14} />}>
                  {t("PlayerAnalysis.Export", "Export")}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => void exportProfile("json")}>JSON</Menu.Item>
                <Menu.Item onClick={() => void exportProfile("html")}>HTML</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      <Paper withBorder p="sm">
        <SimpleGrid cols={{ base: 1, sm: 3, lg: 6 }}>
          <TextInput
            type="date"
            label={t("PlayerAnalysis.StartDate", "From")}
            value={filters.startDate ?? ""}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                startDate: event.currentTarget.value || null,
              }))
            }
          />
          <TextInput
            type="date"
            label={t("PlayerAnalysis.EndDate", "To")}
            value={filters.endDate ?? ""}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                endDate: event.currentTarget.value || null,
              }))
            }
          />
          <Select
            label={t("PlayerAnalysis.Color", "Color")}
            value={filters.color}
            allowDeselect={false}
            data={[
              { value: "any", label: t("PlayerAnalysis.Any", "Any") },
              { value: "white", label: t("Fen.White", "White") },
              { value: "black", label: t("Fen.Black", "Black") },
            ]}
            onChange={(value) =>
              setFilters((previous) => ({
                ...previous,
                color: (value as PlayerAnalysisFilters["color"]) ?? "any",
              }))
            }
          />
          <NumberInput
            label={t("PlayerAnalysis.MinOpponentElo", "Minimum opponent Elo")}
            value={filters.opponentEloMin ?? ""}
            onChange={(value) =>
              setFilters((previous) => ({
                ...previous,
                opponentEloMin: typeof value === "number" ? value : null,
              }))
            }
          />
          <NumberInput
            label={t("PlayerAnalysis.MaxOpponentElo", "Maximum opponent Elo")}
            value={filters.opponentEloMax ?? ""}
            onChange={(value) =>
              setFilters((previous) => ({
                ...previous,
                opponentEloMax: typeof value === "number" ? value : null,
              }))
            }
          />
          <Select
            clearable
            label={t("PlayerAnalysis.TimeControl", "Time control")}
            value={filters.timeControl}
            data={timeControls}
            onChange={(value) => setFilters((previous) => ({ ...previous, timeControl: value }))}
          />
        </SimpleGrid>
        <Group mt="sm">
          <Button
            leftSection={stored ? <IconRefresh size={16} /> : <IconChartDots size={16} />}
            loading={loading}
            disabled={analysisSources.length === 0 || engineLoading}
            onClick={generate}
          >
            {stored
              ? t("PlayerAnalysis.Recalculate", "Recalculate")
              : t("PlayerAnalysis.Generate", "Generate analysis")}
          </Button>
          <Text size="xs" c="dimmed">
            {analysisSources.length} {t("PlayerAnalysis.Sources", "local source(s)")}
            {metadata && ` · ${new Date(metadata.generatedAt).toLocaleString()}`}
          </Text>
        </Group>
        {loading && <Progress mt="sm" value={loadingProgress} animated />}
      </Paper>

      {!metadata ? (
        <Alert color="blue">
          {t(
            "PlayerAnalysis.Empty",
            "Generate the profile to calculate results, openings, opponent groups and evidence-backed findings.",
          )}
        </Alert>
      ) : (
        <Tabs
          value={view.section}
          onChange={(value) =>
            value &&
            setView((previous) => ({
              ...previous,
              section: value as PlayerAnalysisSection,
            }))
          }
          flex={1}
          style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}
        >
          <Tabs.List>
            <Tabs.Tab value="summary">{t("PlayerAnalysis.Summary", "Summary")}</Tabs.Tab>
            <Tabs.Tab value="openings">{t("PlayerAnalysis.Openings", "Openings")}</Tabs.Tab>
            <Tabs.Tab value="findings">{t("PlayerAnalysis.Findings", "Findings")}</Tabs.Tab>
            <Tabs.Tab value="engine">{t("PlayerAnalysis.Engine", "Engine")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="summary" pt="sm" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <ScrollArea
              h="100%"
              type="always"
              offsetScrollbars
              viewportRef={summaryViewport}
              onScrollPositionChange={({ y }) => rememberScroll("summary", y)}
            >
              <Stack>
                <SimpleGrid cols={{ base: 2, sm: 4 }}>
                  <Metric
                    label={t("PlayerAnalysis.Games", "Games")}
                    value={`${metadata.sampleSize}`}
                  />
                  <Metric
                    label={t("PlayerAnalysis.Score", "Score")}
                    value={formatScore(metadata.summary.scorePercent)}
                  />
                  <Metric
                    label={t("PlayerAnalysis.Record", "W-D-L")}
                    value={`${metadata.summary.wins}-${metadata.summary.draws}-${metadata.summary.losses}`}
                  />
                  <Metric
                    label={t("PlayerAnalysis.OpponentElo", "Opponent Elo")}
                    value={metadata.summary.averageOpponentElo?.toFixed(0) ?? "—"}
                  />
                </SimpleGrid>
                <Title order={5}>{t("PlayerAnalysis.ByColor", "By color")}</Title>
                <BucketTable
                  rows={metadata.byColor}
                  label={t("PlayerAnalysis.Color", "Color")}
                  onOpen={openReference}
                />
                <Title order={5}>{t("PlayerAnalysis.ByRating", "By opponent strength")}</Title>
                <BucketTable
                  rows={metadata.byRatingDifference}
                  label={t("PlayerAnalysis.Group", "Group")}
                  onOpen={openReference}
                />
                <Title order={5}>{t("PlayerAnalysis.ByTimeControl", "By time control")}</Title>
                <BucketTable
                  rows={metadata.byTimeControl}
                  label={t("PlayerAnalysis.TimeControl", "Time control")}
                  onOpen={openReference}
                />
                <PlayerPeriodComparison rows={metadata.byYear} />
              </Stack>
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel
            value="openings"
            pt="sm"
            style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          >
            <ScrollArea
              h="100%"
              type="always"
              offsetScrollbars
              viewportRef={openingsViewport}
              onScrollPositionChange={({ y }) => rememberScroll("openings", y)}
            >
              <BucketTable
                rows={metadata.openings}
                label={t("PlayerAnalysis.Opening", "Opening")}
                onOpen={openReference}
              />
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel
            value="findings"
            pt="sm"
            style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          >
            <ScrollArea
              h="100%"
              type="always"
              offsetScrollbars
              viewportRef={findingsViewport}
              onScrollPositionChange={({ y }) => rememberScroll("findings", y)}
            >
              <Stack>
                {metadata.findings.length === 0 && (
                  <Alert color="green">
                    {t(
                      "PlayerAnalysis.NoFindings",
                      "No weakness crossed the current minimum sample and score thresholds.",
                    )}
                  </Alert>
                )}
                {metadata.findings.map((finding) => (
                  <Paper key={finding.id} withBorder p="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Group gap="xs">
                          <Badge color={finding.priority === "high" ? "red" : "orange"}>
                            {priorityLabel(finding.priority, t)}
                          </Badge>
                          <Text fw={600}>{findingTitle(finding.category, finding.subject, t)}</Text>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {finding.sampleSize} {t("PlayerAnalysis.Games", "Games")} ·{" "}
                          {formatScore(finding.scorePercent)}
                        </Text>
                      </div>
                      <Button
                        size="xs"
                        variant="light"
                        disabled={!finding.references[0]}
                        onClick={() =>
                          finding.references[0] && openReference(finding.references[0])
                        }
                      >
                        {t("PlayerAnalysis.OpenEvidence", "Open evidence")}
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </ScrollArea>
          </Tabs.Panel>

          <Tabs.Panel value="engine" pt="sm" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <ScrollArea
              h="100%"
              type="always"
              offsetScrollbars
              viewportRef={engineViewport}
              onScrollPositionChange={({ y }) => rememberScroll("engine", y)}
            >
              <Stack>
                <Alert color="blue">
                  {t(
                    "PlayerAnalysis.EngineScope",
                    "The engine analyzes the newest games in the filtered sample. Results are cached by game, engine and limit, so an interrupted run can continue.",
                  )}
                </Alert>
                <MultiSelect
                  label={t("PlayerAnalysis.EngineTimeControls", "Time controls to analyze")}
                  description={t(
                    "PlayerAnalysis.EngineTimeControlsDescription",
                    "Choose one or more rhythms. The most recent game limit is applied after combining them.",
                  )}
                  placeholder={t(
                    "PlayerAnalysis.SelectTimeControls",
                    "Select at least one time control",
                  )}
                  searchable
                  clearable
                  hidePickedOptions
                  value={engineTimeControls}
                  data={engineTimeControlCounts.map(({ value, count }) => ({
                    value,
                    label: `${timeControlLabel(value, t)} (${count})`,
                  }))}
                  onChange={(values) =>
                    setEngineTimeControls(values as PlayerAnalysisTimeControl[])
                  }
                />
                <Text size="xs" c="dimmed">
                  {t(
                    "PlayerAnalysis.EngineSampleScope",
                    "{{eligible}} eligible games; {{selected}} will be analyzed with the current limit.",
                    {
                      eligible: eligibleEngineGames.length,
                      selected: analyzeAllGames
                        ? eligibleEngineGames.length
                        : Math.min(engineGames, eligibleEngineGames.length),
                    },
                  )}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                  <Select
                    label={t("PlayerAnalysis.Engine", "Engine")}
                    value={engineId}
                    allowDeselect={false}
                    data={localEngines.map((value) => ({ value: value.id, label: value.name }))}
                    onChange={(value) => setEngineId(value ?? "")}
                    placeholder={t("PlayerAnalysis.NoEngine", "Install a local reference engine")}
                  />
                  <NumberInput
                    label={t("PlayerAnalysis.EngineGames", "Most recent games to analyze")}
                    min={1}
                    max={Math.max(1, eligibleEngineGames.length)}
                    step={5}
                    value={engineGames}
                    disabled={analyzeAllGames}
                    onChange={(value) => setEngineGames(typeof value === "number" ? value : 10)}
                  />
                  <Switch
                    mt="xl"
                    checked={analyzeAllGames}
                    disabled={metadata.sampleSize === 0}
                    label={t(
                      "PlayerAnalysis.EngineAllGames",
                      "Analyze all filtered games ({{count}})",
                      {
                        count: eligibleEngineGames.length,
                      },
                    )}
                    onChange={(event) => setAnalyzeAllGames(event.currentTarget.checked)}
                  />
                  <NumberInput
                    label={t("PlayerAnalysis.EngineTime", "Milliseconds per position")}
                    min={50}
                    max={5000}
                    step={50}
                    value={engineTimeMs}
                    onChange={(value) => setEngineTimeMs(typeof value === "number" ? value : 250)}
                  />
                </SimpleGrid>
                <Group>
                  <Button
                    leftSection={<IconPlayerPlay size={16} />}
                    disabled={
                      !engineId ||
                      games.length === 0 ||
                      engineTimeControls.length === 0 ||
                      eligibleEngineGames.length === 0 ||
                      engineLoading
                    }
                    loading={engineLoading}
                    onClick={runEngineAnalysis}
                  >
                    {t("PlayerAnalysis.RunEngine", "Analyze sample")}
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconPlayerPause size={16} />}
                    disabled={!engineLoading}
                    onClick={cancelEngine}
                  >
                    {t("Common.Cancel", "Cancel")}
                  </Button>
                  {games.length === 0 && (
                    <Text size="xs" c="dimmed">
                      {t(
                        "PlayerAnalysis.LoadFirst",
                        "Recalculate the metadata before running the engine.",
                      )}
                    </Text>
                  )}
                </Group>
                {engineLoading && <Progress value={engineProgress} animated />}
                {engine && (
                  <>
                    <Divider />
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">
                        {t(
                          "PlayerAnalysis.EngineSavedScope",
                          "Saved sample: {{analyzed}} of {{eligible}} eligible games",
                          {
                            analyzed: engine.analyzedGames,
                            eligible: engine.eligibleGames,
                          },
                        )}
                      </Text>
                      {engine.timeControlBreakdown.map((item) => (
                        <Badge key={item.value} size="sm" variant="light">
                          {timeControlLabel(item.value, t)} · {item.analyzedGames}/
                          {item.eligibleGames}
                        </Badge>
                      ))}
                    </Group>
                    {engine.clockCoverage && (
                      <Alert
                        color={engine.clockCoverage.level === "insufficient" ? "yellow" : "blue"}
                      >
                        {t("PlayerAnalysis.ClockCoverage", "Clock coverage")}:{" "}
                        {engine.clockCoverage.gamesWithClock}/{engine.clockCoverage.selectedGames} (
                        {engine.clockCoverage.percent.toFixed(1)}%) ·{" "}
                        {t(
                          `PlayerAnalysis.ClockCoverage.${engine.clockCoverage.level}`,
                          {
                            insufficient: "Insufficient",
                            exploratory: "Exploratory",
                            adequate: "Adequate",
                            high: "High",
                          }[engine.clockCoverage.level],
                        )}
                        .{" "}
                        {t(
                          "PlayerAnalysis.ClockCoverageScope",
                          "Coverage describes the selected engine sample; Onyx does not publish aggregate time-management conclusions when it is insufficient.",
                        )}
                      </Alert>
                    )}
                    {engine.timeManagement && (
                      <>
                        <Title order={5}>
                          {t("PlayerAnalysis.TimeManagement", "Time management")}
                        </Title>
                        <SimpleGrid cols={{ base: 1, sm: 3 }}>
                          <Metric
                            label={t("PlayerAnalysis.MeasuredDecisions", "Measured decisions")}
                            value={`${engine.timeManagement.measuredDecisions}`}
                          />
                          <Metric
                            label={t("PlayerAnalysis.AverageDecisionTime", "Average decision time")}
                            value={`${engine.timeManagement.averageDecisionSeconds.toFixed(1)} s`}
                          />
                          <Metric
                            label={t("PlayerAnalysis.LowTimeMoves", "Moves with 30 s or less")}
                            value={`${engine.timeManagement.lowTimeMoves}`}
                          />
                        </SimpleGrid>
                        <Text size="xs" c="dimmed">
                          {t(
                            "PlayerAnalysis.TimeManagementScope",
                            "Decision time is reconstructed only for consecutive player clocks with a simple base+increment time control. {{errors}} critical errors occurred with 30 seconds or less. These figures are descriptive, not causal.",
                            { errors: engine.timeManagement.criticalErrorsInLowTime },
                          )}
                        </Text>
                      </>
                    )}
                    <SimpleGrid cols={{ base: 2, sm: 6 }}>
                      <Metric
                        label={t("PlayerAnalysis.AnalyzedGames", "Analyzed games")}
                        value={`${engine.analyzedGames}`}
                      />
                      <Metric label="ACPL" value={formatCp(engine.acpl)} />
                      <Metric
                        label={t("PlayerAnalysis.Mistakes", "Mistakes")}
                        value={`${engine.mistakes}`}
                      />
                      <Metric
                        label={t("PlayerAnalysis.Blunders", "Blunders")}
                        value={`${engine.blunders}`}
                      />
                      <Metric
                        label={t("PlayerAnalysis.Conversion", "Advantage conversion")}
                        value={formatScore(engine.conversionRate)}
                      />
                      <Metric
                        label={t("PlayerAnalysis.Defense", "Inferior positions saved")}
                        value={formatScore(engine.defenseRate)}
                      />
                    </SimpleGrid>
                    <Title order={5}>{t("PlayerAnalysis.ByPhase", "Quality by phase")}</Title>
                    <Table withTableBorder striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t("PlayerAnalysis.Phase", "Phase")}</Table.Th>
                          <Table.Th ta="right">{t("PlayerAnalysis.Moves", "Moves")}</Table.Th>
                          <Table.Th ta="right">ACPL</Table.Th>
                          <Table.Th ta="right">?! / ? / ??</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {engine.phases.map((phase) => (
                          <Table.Tr key={phase.phase}>
                            <Table.Td>{phaseLabel(phase.phase, t)}</Table.Td>
                            <Table.Td ta="right">{phase.moves}</Table.Td>
                            <Table.Td ta="right">{formatCp(phase.acpl)}</Table.Td>
                            <Table.Td ta="right">{`${phase.inaccuracies} / ${phase.mistakes} / ${phase.blunders}`}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                    <PlayerVerifiableInsights
                      engine={engine}
                      training={trainingAreas}
                      onOpen={openReference}
                    />
                    {engine.recurringErrors.length > 0 && (
                      <>
                        <Title order={5}>{t("PlayerAnalysis.Recurring", "Recurring errors")}</Title>
                        <Text size="xs" c="dimmed">
                          {t(
                            "PlayerAnalysis.RecurringExplanation",
                            "Errors are grouped only when the same normalized position, played move and severity occur at least twice. Open the evidence to inspect each occurrence.",
                          )}
                        </Text>
                        <Table withTableBorder striped>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>{t("PlayerAnalysis.Opening", "Opening")}</Table.Th>
                              <Table.Th>{t("PlayerAnalysis.Phase", "Phase")}</Table.Th>
                              <Table.Th>{t("PlayerAnalysis.Type", "Type")}</Table.Th>
                              <Table.Th>{t("PlayerAnalysis.PlayedMove", "Played move")}</Table.Th>
                              <Table.Th ta="right">{t("PlayerAnalysis.Count", "Count")}</Table.Th>
                              <Table.Th ta="right">
                                {t("PlayerAnalysis.AverageLoss", "Average loss")}
                              </Table.Th>
                              <Table.Th />
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {engine.recurringErrors.map((error) => (
                              <Table.Tr key={error.key}>
                                <Table.Td>{error.opening}</Table.Td>
                                <Table.Td>{phaseLabel(error.phase, t)}</Table.Td>
                                <Table.Td>{classificationLabel(error.classification, t)}</Table.Td>
                                <Table.Td>
                                  <Text size="sm" title={error.fen}>
                                    {error.playedMove ?? "—"}
                                  </Text>
                                </Table.Td>
                                <Table.Td ta="right">{error.count}</Table.Td>
                                <Table.Td ta="right">{error.averageLoss.toFixed(0)} cp</Table.Td>
                                <Table.Td ta="right">
                                  <Button
                                    size="compact-xs"
                                    variant="subtle"
                                    onClick={() => openReference(error.references[0])}
                                  >
                                    {t("PlayerAnalysis.Evidence", "Evidence")}
                                  </Button>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </>
                    )}
                    <Group justify="space-between" align="end">
                      <Title order={5}>{t("PlayerAnalysis.Critical", "Training candidates")}</Title>
                      <Select
                        label={t("PlayerAnalysis.TargetSet", "Tactical set")}
                        placeholder={t("PlayerAnalysis.CreateSet", "Create “My tactical errors”")}
                        clearable
                        value={selectedSetId}
                        data={userTacticsSets.map((set) => ({ value: set.id, label: set.name }))}
                        onChange={setSelectedSetId}
                      />
                    </Group>
                    <Table withTableBorder highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t("PlayerAnalysis.Game", "Game")}</Table.Th>
                          <Table.Th>{t("PlayerAnalysis.Phase", "Phase")}</Table.Th>
                          <Table.Th>{t("PlayerAnalysis.Type", "Type")}</Table.Th>
                          <Table.Th ta="right">{t("PlayerAnalysis.Loss", "Loss")}</Table.Th>
                          <Table.Th />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {engine.criticalPositions.slice(0, 100).map((critical) => (
                          <Table.Tr key={`${critical.key}:${critical.ply}`}>
                            <Table.Td>{critical.gameLabel}</Table.Td>
                            <Table.Td>{phaseLabel(critical.phase, t)}</Table.Td>
                            <Table.Td>{classificationLabel(critical.classification, t)}</Table.Td>
                            <Table.Td ta="right">{critical.cpLoss.toFixed(0)} cp</Table.Td>
                            <Table.Td>
                              <Group gap="xs" justify="flex-end">
                                <Button
                                  size="compact-xs"
                                  variant="subtle"
                                  onClick={() => openReference(critical)}
                                >
                                  {t("PlayerAnalysis.Evidence", "Evidence")}
                                </Button>
                                <Button
                                  size="compact-xs"
                                  disabled={
                                    critical.bestLine.length === 0 &&
                                    critical.punishmentLine.length === 0
                                  }
                                  onClick={() => setPendingCritical(critical)}
                                >
                                  {t("PlayerAnalysis.AddToSet", "Add to set")}
                                </Button>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </>
                )}
              </Stack>
            </ScrollArea>
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
