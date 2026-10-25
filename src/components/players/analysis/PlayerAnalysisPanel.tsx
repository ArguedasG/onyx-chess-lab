import {
  Alert,
  Button,
  Group,
  Menu,
  NumberInput,
  Paper,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { notifications } from "@mantine/notifications";
import { IconChartDots, IconDownload, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AnalysisArtifactDocument, EngineOption, GoMode } from "@/bindings";
import { commands } from "@/bindings";
import AnalysisLibraryModal from "@/components/analysis/AnalysisLibraryModal";
import { enginesAtom } from "@/state/atoms";
import {
  playerAnalysisAtom,
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
  PLAYER_ANALYSIS_CLASSIFICATION,
  PLAYER_ANALYSIS_SCHEMA_VERSION,
  PLAYER_ANALYSIS_TIME_CONTROLS,
  playerAnalysisTimeControlCounts,
  selectPlayerEngineGames,
  type PlayerAnalysisCriticalPosition,
  type PlayerAnalysisExercisePerspective,
  type PlayerAnalysisFilters,
  type PlayerAnalysisGame,
  type PlayerAnalysisReference,
  type PlayerAnalysisSource,
  type PlayerAnalysisTimeControl,
} from "@/utils/playerAnalysis";
import { savePlayerAnalysisExport } from "@/utils/playerAnalysisExport";
import {
  addTacticsExerciseToSet,
  addTacticsSet,
  type ParsedTrainingRecord,
} from "@/utils/trainingAreas";
import { treeIteratorMainLine } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import AnalysisEngineSection from "./AnalysisEngineSection";
import AnalysisFindingsSection from "./AnalysisFindingsSection";
import AnalysisSummarySection from "./AnalysisSummarySection";
import {
  cachePlayerGames,
  loadProfileGames,
  loadProfileGamesOnce,
  playerGamesCache,
} from "./analysisGames";
import PerspectiveModal from "./PerspectiveModal";
import PlayerOpeningsTable from "./PlayerOpeningsTable";
import PlayerVersionComparison from "./PlayerVersionComparison";

/**
 * Player Analysis of a player card: descriptive profile and engine analysis of a sample, local and
 * versioned. The card owns the sources (player records and manual aliases); `profileId` stays the
 * same when aliases are added, so the saved profile is not lost.
 */
export default function PlayerAnalysisPanel({
  playerName,
  profileId,
  sources,
  onOpenReference,
  explicitGameKeys = null,
  onClearExplicitGames,
  onAddToMistakes,
}: {
  playerName: string;
  profileId: string;
  sources: PlayerAnalysisSource[];
  onOpenReference: (reference: PlayerAnalysisReference) => void;
  /** Games chosen in the Games tab to analyze with the engine instead of the newest ones. */
  explicitGameKeys?: string[] | null;
  onAddToMistakes?: (critical: PlayerAnalysisCriticalPosition) => void;
  onClearExplicitGames?: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useAtom(playerAnalysisAtom);
  const [trainingAreas, setTrainingAreas] = useAtom(trainingAreasAtom);
  const [engines] = useAtom(enginesAtom);
  const [view, setView] = useAtom(playerAnalysisViewFamily(profileId));
  const summaryViewport = useRef<HTMLDivElement>(null);
  const openingsViewport = useRef<HTMLDivElement>(null);
  const findingsViewport = useRef<HTMLDivElement>(null);
  const engineViewport = useRef<HTMLDivElement>(null);
  const selectedScrollY = view.scrollY[view.section];
  const storedCandidate = state.profiles[profileId];
  const stored =
    storedCandidate?.schemaVersion === PLAYER_ANALYSIS_SCHEMA_VERSION ? storedCandidate : null;
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
  const [libraryOpened, setLibraryOpened] = useState(false);
  const [comparisonDocument, setComparisonDocument] = useState<AnalysisArtifactDocument | null>(
    null,
  );
  const [engineProgress, setEngineProgress] = useState(0);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [pendingCritical, setPendingCritical] = useState<PlayerAnalysisCriticalPosition | null>(
    null,
  );
  const cancelled = useRef(false);
  const activeAnalysisIds = useRef<Set<string>>(new Set());
  const loadRequestId = useRef(0);
  const profileSnapshot = useRef({
    sources,
    filters: stored?.metadata.filters,
    t,
  });
  profileSnapshot.current = { sources, filters: stored?.metadata.filters, t };
  const hasStoredProfile = stored !== null;
  // The games are reloaded when the card gains or loses a source.
  const sourcesKey = useMemo(
    () =>
      sources
        .map((source) => `${source.databasePath}:${source.playerId}`)
        .sort()
        .join("|"),
    [sources],
  );
  const gamesCacheKey = `${profileId}|${sourcesKey}`;

  useEffect(() => {
    const requestId = ++loadRequestId.current;
    const snapshot = profileSnapshot.current;
    setFilters(snapshot.filters ?? DEFAULT_PLAYER_ANALYSIS_FILTERS);
    const cached = playerGamesCache.get(gamesCacheKey);
    if (cached) {
      cachePlayerGames(gamesCacheKey, cached);
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
    void loadProfileGamesOnce(gamesCacheKey, snapshot.sources)
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
  }, [gamesCacheKey, hasStoredProfile]);

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
  const explicitGames = useMemo(() => {
    if (!explicitGameKeys) return null;
    const keys = new Set(explicitGameKeys);
    return games.filter((game) => keys.has(game.key));
  }, [explicitGameKeys, games]);
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
      const unique = await loadProfileGames(sources, (progress) => {
        if (loadRequestId.current === requestId) setLoadingProgress(progress);
      });
      if (loadRequestId.current !== requestId) return;
      cachePlayerGames(gamesCacheKey, unique);
      setGames(unique);
      const metadata = analyzePlayerGames(playerName, unique, sources, filters);
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
  }, [filters, gamesCacheKey, playerName, profileId, saveProfile, sources, t]);

  // Games sent from the Games tab need the profile: it is generated once, then the engine view opens.
  const autoGenerated = useRef(false);
  useEffect(() => {
    if (!explicitGameKeys) {
      autoGenerated.current = false;
      return;
    }
    setView((previous) => ({ ...previous, section: "engine" }));
    if (!hasStoredProfile && !loading && !autoGenerated.current) {
      autoGenerated.current = true;
      void generate();
    }
  }, [explicitGameKeys, generate, hasStoredProfile, loading, setView]);

  const saveVersion = useCallback(async () => {
    if (!stored) return;
    setVersionSaving(true);
    try {
      const document = unwrap(
        await commands.saveAnalysisArtifact(
          "playerProfile",
          stored.artifactId ?? null,
          playerName,
          sources.map((source) => source.databaseTitle).join(" · "),
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
  }, [playerName, saveProfile, sources, stored, t]);

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

  const runEngineAnalysis = useCallback(async () => {
    const engine = localEngines.find((candidate) => candidate.id === engineId);
    if (!engine || !stored || games.length === 0) return;
    const selected =
      explicitGames ??
      selectPlayerEngineGames(
        games,
        stored.metadata.filters,
        analyzeAllGames ? "all" : engineGames,
        engineTimeControls,
      );
    const options: EngineOption[] = (engine.settings ?? []).map((setting) => ({
      name: setting.name,
      value: setting.value == null ? "" : String(setting.value),
    }));
    const limit = `time:${engineTimeMs}ms|${PLAYER_ANALYSIS_CLASSIFICATION}`;
    const sameEngine =
      stored.engine?.engine.path === engine.path && stored.engine.engine.limit === limit;
    const reusable = sameEngine
      ? new Map(stored.engine!.games.map((game) => [game.key, game]))
      : new Map();
    const analyzed = selected.flatMap((game) =>
      reusable.has(game.key) ? [reusable.get(game.key)!] : [],
    );
    let skipped = 0;
    cancelled.current = false;
    setEngineLoading(true);
    setEngineProgress(selected.length ? (analyzed.length / selected.length) * 100 : 0);
    try {
      // Several games at once, as many as the engine budget allows (see `get_engine_budget`).
      const budget = await commands.getEngineBudget();
      const pending = selected.filter((item) => !reusable.has(item.key));
      let next = 0;
      const analyzeOne = async (item: (typeof selected)[number]) => {
        const analysisId = `player-analysis-${profileId}-${item.game.id}`;
        activeAnalysisIds.current.add(analysisId);
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
              // Waits for a slot of the engine budget and uses its threads and hash.
              priority: "batch",
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
          if (cancelled.current) return;
          skipped += 1;
          console.warn("Player analysis skipped a game", item.key, error);
        } finally {
          activeAnalysisIds.current.delete(analysisId);
        }
      };
      const worker = async () => {
        while (!cancelled.current && next < pending.length) {
          const item = pending[next];
          next += 1;
          await analyzeOne(item);
          setEngineProgress((analyzed.length / selected.length) * 100);
        }
      };
      await Promise.all(
        Array.from({ length: Math.max(1, Math.min(budget.batchProcesses, pending.length)) }, () =>
          worker(),
        ),
      );
      // Games chosen by hand join the saved sample instead of replacing it.
      if (explicitGames && sameEngine) {
        const chosen = new Set(analyzed.map((game) => game.key));
        analyzed.push(...stored.engine!.games.filter((game) => !chosen.has(game.key)));
      }
      const included = new Set(analyzed.map((game) => game.key));
      const sample = explicitGames
        ? [
            ...selected,
            ...games.filter((game) => included.has(game.key) && !selected.includes(game)),
          ]
        : selected;
      // Workers finish in any order; keep the games in their selection order.
      const order = new Map(sample.map((item, index) => [item.key, index]));
      analyzed.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
      const timeControls = explicitGames
        ? [...new Set(sample.map((game) => getPlayerAnalysisTimeControl(game)))]
        : engineTimeControls;
      const eligiblePool = explicitGames ? sample : eligibleEngineGames;
      const result = aggregateEngineAnalysis({
        engine: {
          name: engine.name,
          path: engine.path,
          args: engine.args ?? [],
          options,
          limit,
        },
        requestedGames: sample.length,
        eligibleGames: eligiblePool.length,
        timeControls,
        timeControlBreakdown: timeControls.flatMap((value) => {
          const eligibleGames = eligiblePool.filter(
            (game) => getPlayerAnalysisTimeControl(game) === value,
          ).length;
          const selectedKeys = new Set(
            sample
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
      if (explicitGames && !cancelled.current) onClearExplicitGames?.();
    } finally {
      activeAnalysisIds.current.clear();
      setEngineLoading(false);
    }
  }, [
    analyzeAllGames,
    engineGames,
    engineId,
    engineTimeMs,
    engineTimeControls,
    eligibleEngineGames,
    explicitGames,
    games,
    localEngines,
    onClearExplicitGames,
    profileId,
    saveProfile,
    stored,
  ]);

  const cancelEngine = useCallback(() => {
    cancelled.current = true;
    for (const id of activeAnalysisIds.current) void commands.cancelAnalysis(id);
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
  const scrollPanel = (
    section: PlayerAnalysisSection,
    viewportRef: React.RefObject<HTMLDivElement | null>,
    content: React.ReactNode,
  ) => (
    <Tabs.Panel value={section} pt="sm" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <ScrollArea
        h="100%"
        type="always"
        offsetScrollbars
        viewportRef={viewportRef}
        onScrollPositionChange={({ y }) => rememberScroll(section, y)}
      >
        {content}
      </ScrollArea>
    </Tabs.Panel>
  );

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
      <PerspectiveModal
        pendingCritical={pendingCritical}
        setPendingCritical={setPendingCritical}
        addCriticalToSet={addCriticalToSet}
      />
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
              playerGamesCache.delete(gamesCacheKey);
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
              size="xs"
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
            disabled={sources.length === 0 || engineLoading}
            onClick={generate}
          >
            {stored
              ? t("PlayerAnalysis.Recalculate", "Recalculate")
              : t("PlayerAnalysis.Generate", "Generate analysis")}
          </Button>
          <Text size="xs" c="dimmed">
            {sources.length} {t("PlayerAnalysis.Sources", "local source(s)")}
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

          {scrollPanel(
            "summary",
            summaryViewport,
            <AnalysisSummarySection metadata={metadata} onOpen={onOpenReference} />,
          )}
          {scrollPanel(
            "openings",
            openingsViewport,
            <PlayerOpeningsTable
              openings={metadata.openings}
              groups={metadata.openingGroups}
              onOpen={onOpenReference}
            />,
          )}
          {scrollPanel(
            "findings",
            findingsViewport,
            <AnalysisFindingsSection findings={metadata.findings} onOpen={onOpenReference} />,
          )}
          {scrollPanel(
            "engine",
            engineViewport,
            <AnalysisEngineSection
              controls={{
                engineId,
                setEngineId,
                localEngines,
                engineGames,
                setEngineGames,
                analyzeAllGames,
                setAnalyzeAllGames,
                engineTimeMs,
                setEngineTimeMs,
                engineTimeControls,
                setEngineTimeControls,
                engineTimeControlCounts,
                eligibleGames: eligibleEngineGames.length,
                explicitGames: explicitGames ? explicitGames.length : null,
                clearExplicitGames: () => onClearExplicitGames?.(),
                loadedGames: games.length,
                sampleSize: metadata.sampleSize,
                engineLoading,
                engineProgress,
                run: () => void runEngineAnalysis(),
                cancel: cancelEngine,
              }}
              engine={engine}
              training={trainingAreas}
              onOpen={onOpenReference}
              tacticsSets={userTacticsSets}
              selectedSetId={selectedSetId}
              setSelectedSetId={setSelectedSetId}
              onAddCritical={setPendingCritical}
              onAddToMistakes={onAddToMistakes}
            />,
          )}
        </Tabs>
      )}
    </Stack>
  );
}
