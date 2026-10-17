import {
  Alert,
  Avatar,
  Badge,
  Button,
  Center,
  Chip,
  Group,
  Loader,
  Menu,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlignBoxLeftMiddle,
  IconBookmark,
  IconChartBar,
  IconBarbell,
  IconChess,
  IconCloudDownload,
  IconCpu,
  IconDots,
  IconEdit,
  IconId,
  IconList,
  IconSitemap,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { databaseConversionStateAtom, storedDatabasesDirAtom } from "@/state/atoms";
import { playerAnalysisAtom, playerAnalysisViewFamily } from "@/state/playerAnalysis";
import { type PlayerCardTab, playerCardTabAtom, sourceKey } from "@/state/playerCards";
import { getDatabases } from "@/utils/db";
import {
  PLAYER_ANALYSIS_SCHEMA_VERSION,
  type PlayerAnalysisReference,
} from "@/utils/playerAnalysis";
import { accountSyncTarget } from "@/utils/players/accountSources";
import { addMistakes, queueOwner, withOwnerQueue } from "@/utils/mistakes/queue";
import { useMistakeQueues } from "@/state/mistakeQueue";
import { syncAccountGames } from "@/utils/players/accountSync";
import {
  DEFAULT_PROFILE_FILTERS,
  filterProfileGames,
  type ProfileFilters,
  type ProfileGame,
  timeControlsOf,
} from "@/utils/players/profileGames";
import PlayerAnalysisPanel from "./analysis/PlayerAnalysisPanel";
import PreparationTab, { preparationSectionAtom } from "./preparation/PreparationTab";
import TrainingTab, { useAutoMistakes } from "./training/TrainingTab";
import RivalGamesModal from "./RivalGamesModal";
import { EngineAnalysisContext, initials } from "./common";
import { timeControlLabel } from "./labels";
import {
  CardEditModal,
  FideLinkModal,
  KIND_COLORS,
  SourcesModal,
  useKindLabels,
} from "./PlayerCardModals";
import GamesTab from "./tabs/GamesTab";
import OpeningsTab from "./tabs/OpeningsTab";
import RivalsTab from "./tabs/RivalsTab";
import SummaryTab from "./tabs/SummaryTab";
import { type PlayerGameReturn, useOpenPlayerGame } from "./useOpenPlayerGame";
import type { PlayerCardChange, ResolvedPlayerCard } from "./usePlayerCards";
import { usePlayerGames } from "./usePlayerGames";

type CardActions = {
  save?: (value: { name: string; kind: ResolvedPlayerCard["kind"]; notes: string }) => void;
  update?: (change: PlayerCardChange) => void;
  /** Records that the aliases of the card's analysis profile were moved to it. */
  markAliasesMigrated?: () => void;
  remove?: () => void;
};

/**
 * The player card (I-02): the same view for the user, a rival or a student. Summary, games,
 * openings and rivals come from the games without an engine; Analysis is Player Analysis.
 */
export default function PlayerCardView({
  card,
  returnPath,
  selfSources,
  actions,
}: {
  card: ResolvedPlayerCard;
  returnPath: PlayerGameReturn["path"];
  selfSources: ResolvedPlayerCard["sources"];
  actions: CardActions;
}) {
  const { t } = useTranslation();
  const kinds = useKindLabels();
  const { data: allGames, error, isLoading, mutate } = usePlayerGames(card.sources);
  const [filters, setFilters] = useState<ProfileFilters>(DEFAULT_PROFILE_FILTERS);
  const [tabs, setTabs] = useAtom(playerCardTabAtom);
  const tab = tabs[card.id] ?? "summary";
  const setTab = useCallback(
    (value: PlayerCardTab) => setTabs((previous) => ({ ...previous, [card.id]: value })),
    [card.id, setTabs],
  );
  const setAnalysisView = useSetAtom(playerAnalysisViewFamily(card.analysisProfileId));
  // Every engine mark of the card leads to the engine view of the Analysis tab.
  const openEngineAnalysis = useCallback(() => {
    setAnalysisView((previous) => ({ ...previous, section: "engine" }));
    setTab("analysis");
  }, [setAnalysisView, setTab]);
  const setPreparationSection = useSetAtom(preparationSectionAtom);
  // My mistakes (8.7) belong to the user and to students; every card of the user shares one queue.
  const trainingOwner = card.kind === "self" || card.kind === "student" ? queueOwner(card) : null;
  const [gamesSearch, setGamesSearch] = useState({ value: "", version: 0 });
  const [explicitGameKeys, setExplicitGameKeys] = useState<string[] | null>(null);
  const [editOpened, setEditOpened] = useState(false);
  const [saveOpened, setSaveOpened] = useState(false);
  const [sourcesOpened, setSourcesOpened] = useState(false);
  const [fideOpened, setFideOpened] = useState(false);
  const [rivalGamesOpened, setRivalGamesOpened] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [databaseDir] = useAtom(storedDatabasesDirAtom);
  const [, setConversionState] = useAtom(databaseConversionStateAtom);
  const analysis = useAtomValue(playerAnalysisAtom);
  const stored = analysis.profiles[card.analysisProfileId];
  const engine = stored?.schemaVersion === PLAYER_ANALYSIS_SCHEMA_VERSION ? stored.engine : null;
  useAutoMistakes(trainingOwner, card.analysisProfileId, engine);
  const { update: updateQueues } = useMistakeQueues();
  const analyzedKeys = useMemo(
    () => new Set(engine?.games.map((game) => game.key) ?? []),
    [engine],
  );

  // Aliases added in the old Player Analysis panel live in its saved profile: move them to the card.
  // Done once per profile, so an alias removed from the card later does not come back.
  const update = actions.update;
  const markMigrated = actions.markAliasesMigrated;
  useEffect(() => {
    if (card.aliasesMigrated || !update || !markMigrated) return;
    if (stored?.schemaVersion === PLAYER_ANALYSIS_SCHEMA_VERSION) {
      const known = new Set(card.sources.map(sourceKey));
      const missing = stored.metadata.sources.filter((source) => !known.has(sourceKey(source)));
      if (missing.length > 0) update({ sources: [...card.sources, ...missing] });
    }
    markMigrated();
  }, [card.aliasesMigrated, card.sources, markMigrated, stored, update]);

  const games = useMemo(() => filterProfileGames(allGames ?? [], filters), [allGames, filters]);
  const timeControls = useMemo(() => timeControlsOf(allGames ?? []), [allGames]);

  const openGame = useOpenPlayerGame({
    path: returnPath,
    profileId: card.analysisProfileId,
    playerName: card.name,
  });
  const openProfileGame = useCallback(
    (game: ProfileGame, ply: number | null = null) =>
      void openGame(game.source.databasePath, game.id, ply),
    [openGame],
  );
  const openReference = useCallback(
    (reference: PlayerAnalysisReference) =>
      void openGame(reference.databasePath, reference.gameId, reference.ply),
    [openGame],
  );

  const sync = useCallback(async () => {
    if (!card.sessions?.length) return;
    setSyncing(true);
    try {
      const databases = await getDatabases();
      for (const session of card.sessions) {
        const target = accountSyncTarget(session, databases);
        if (target) await syncAccountGames(target, databaseDir, setConversionState);
      }
      await mutate();
      notifications.show({
        color: "green",
        message: t("Players.Games.Synced", "Accounts updated."),
      });
    } catch (reason) {
      notifications.show({
        color: "red",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setSyncing(false);
    }
  }, [card.sessions, databaseDir, mutate, setConversionState, t]);

  const databaseTitles = [...new Set(card.sources.map((source) => source.databaseTitle))];
  const mainFide = card.fide;

  return (
    <EngineAnalysisContext.Provider value={openEngineAnalysis}>
      <Stack h="100%" gap="sm" style={{ minHeight: 0 }}>
        {actions.save && (
          <CardEditModal
            opened={saveOpened}
            onClose={() => setSaveOpened(false)}
            title={t("Players.Save.Title", "Save player card")}
            initial={{ name: card.name, kind: "rival" }}
            onSubmit={(value) => {
              actions.save?.(value);
              setSaveOpened(false);
            }}
          />
        )}
        {update && (
          <CardEditModal
            opened={editOpened}
            onClose={() => setEditOpened(false)}
            title={t("Players.Edit.Title", "Edit card")}
            allowName={card.origin === "saved"}
            initial={{ name: card.name, kind: card.kind, notes: card.notes }}
            onSubmit={(value) => {
              update(card.origin === "saved" ? value : { notes: value.notes });
              setEditOpened(false);
            }}
          />
        )}
        {update && (
          <SourcesModal
            opened={sourcesOpened}
            onClose={() => setSourcesOpened(false)}
            sources={card.sources}
            fixed={new Set(card.fixedSources.map(sourceKey))}
            onChange={(sources) => update({ sources })}
          />
        )}
        {update && (
          <RivalGamesModal
            opened={rivalGamesOpened}
            onClose={() => setRivalGamesOpened(false)}
            name={card.name}
            sources={card.sources}
            onAdd={async (sources) => {
              update({ sources: [...card.sources, ...sources] });
              await mutate();
            }}
          />
        )}
        {update && (
          <FideLinkModal
            opened={fideOpened}
            onClose={() => setFideOpened(false)}
            name={card.name}
            linked={card.fide}
            onLink={(fide) => update({ fide })}
          />
        )}

        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar size={56} radius="xl" color={KIND_COLORS[card.kind]} variant="light">
              {initials(card.name)}
            </Avatar>
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap">
                {mainFide?.title && <Badge color="yellow">{mainFide.title}</Badge>}
                <Title order={3} lineClamp={1}>
                  {card.name}
                </Title>
              </Group>
              <Group gap={6}>
                <Badge variant="light" color={KIND_COLORS[card.kind]}>
                  {card.origin === "search" ? t("Players.Unsaved", "Not saved") : kinds[card.kind]}
                </Badge>
                {mainFide && (
                  <Tooltip
                    label={t(
                      "Players.Fide.Ratings",
                      "Standard {{standard}} · Rapid {{rapid}} · Blitz {{blitz}}",
                      {
                        standard: mainFide.standard || "—",
                        rapid: mainFide.rapid || "—",
                        blitz: mainFide.blitz || "—",
                      },
                    )}
                  >
                    <Badge
                      variant="outline"
                      color="gray"
                      style={{ cursor: "pointer" }}
                      onClick={() => setFideOpened(true)}
                    >
                      FIDE {mainFide.standard || mainFide.rapid || mainFide.blitz || mainFide.id}
                    </Badge>
                  </Tooltip>
                )}
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {databaseTitles.join(" · ")}
                  {allGames &&
                    ` · ${t("Players.GamesCount", "{{count}} games", { count: allGames.length })}`}
                </Text>
              </Group>
              {card.notes && (
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {card.notes}
                </Text>
              )}
            </Stack>
          </Group>
          <Group gap="xs" wrap="nowrap">
            {actions.save && (
              <Button leftSection={<IconBookmark size={16} />} onClick={() => setSaveOpened(true)}>
                {t("Players.Save.Button", "Save card")}
              </Button>
            )}
            {update && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Button variant="default" rightSection={<IconDots size={16} />}>
                    {t("Players.Card.Actions", "Card")}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconEdit size={14} />}
                    onClick={() => setEditOpened(true)}
                  >
                    {card.origin === "saved"
                      ? t("Players.Edit.Menu", "Edit name, kind and notes")
                      : t("Players.Edit.NotesMenu", "Edit notes")}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconUsers size={14} />}
                    onClick={() => setSourcesOpened(true)}
                  >
                    {t("Players.Sources.Menu", "Sources and aliases ({{count}})", {
                      count: card.sources.length,
                    })}
                  </Menu.Item>
                  {card.origin === "saved" && (
                    <Menu.Item
                      leftSection={<IconCloudDownload size={14} />}
                      onClick={() => setRivalGamesOpened(true)}
                    >
                      {t("Players.RivalGames.Menu", "Add games (account, PGN, broadcasts)")}
                    </Menu.Item>
                  )}
                  <Menu.Item leftSection={<IconId size={14} />} onClick={() => setFideOpened(true)}>
                    {card.fide
                      ? t("Players.Fide.Menu.Linked", "FIDE profile")
                      : t("Players.Fide.Menu.Link", "Link FIDE profile")}
                  </Menu.Item>
                  {actions.remove && (
                    <>
                      <Menu.Divider />
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={async () => {
                          if (
                            await ask(
                              t(
                                "Players.Delete.Confirm",
                                "Delete this card? Its games stay in their databases and its Player Analysis profile is kept.",
                              ),
                              { kind: "warning" },
                            )
                          )
                            actions.remove?.();
                        }}
                      >
                        {t("Players.Delete.Button", "Delete card")}
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Group>

        <Tabs
          value={tab}
          onChange={(value) => value && setTab(value as PlayerCardTab)}
          keepMounted={false}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Tabs.List style={{ flexWrap: "nowrap" }}>
              <Tabs.Tab value="summary" leftSection={<IconAlignBoxLeftMiddle size={16} />}>
                {t("Players.Tab.Summary", "Summary")}
              </Tabs.Tab>
              <Tabs.Tab value="games" leftSection={<IconList size={16} />}>
                {t("Players.Tab.Games", "Games")}
              </Tabs.Tab>
              <Tabs.Tab value="openings" leftSection={<IconSitemap size={16} />}>
                {t("Players.Tab.Openings", "Openings")}
              </Tabs.Tab>
              <Tabs.Tab value="rivals" leftSection={<IconUsers size={16} />}>
                {t("Players.Tab.Rivals", "Rivals")}
              </Tabs.Tab>
              <Tabs.Tab value="analysis" leftSection={<IconCpu size={16} />}>
                {t("Players.Tab.Analysis", "Analysis")}
              </Tabs.Tab>
              <Tabs.Tab value="preparation" leftSection={<IconChess size={16} />}>
                {t("Players.Tab.Preparation", "Preparation")}
              </Tabs.Tab>
              {trainingOwner && (
                <Tabs.Tab value="training" leftSection={<IconBarbell size={16} />}>
                  {t("Players.Tab.Training", "Training")}
                </Tabs.Tab>
              )}
            </Tabs.List>
          </Group>

          {tab !== "analysis" && (
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              timeControls={timeControls}
              shown={games.length}
              total={allGames?.length ?? 0}
            />
          )}

          {isLoading ? (
            <Center style={{ flex: 1 }}>
              <Stack align="center" gap="xs">
                <Loader />
                <Text size="sm" c="dimmed">
                  {t("Players.Loading", "Reading the games…")}
                </Text>
              </Stack>
            </Center>
          ) : error ? (
            <Alert color="red" mt="md">
              {error instanceof Error ? error.message : String(error)}
            </Alert>
          ) : (
            <>
              <Tabs.Panel value="summary" style={{ flex: 1, minHeight: 0 }}>
                <ScrollArea h="100%" offsetScrollbars>
                  <SummaryTab
                    games={games}
                    engine={engine}
                    onOpenGame={openProfileGame}
                    onShowRivals={() => setTab("rivals")}
                  />
                </ScrollArea>
              </Tabs.Panel>
              <Tabs.Panel value="games" style={{ flex: 1, minHeight: 0 }}>
                <GamesTab
                  key={gamesSearch.version}
                  initialSearch={gamesSearch.value}
                  games={games}
                  analyzedKeys={analyzedKeys}
                  onOpenGame={(game) => openProfileGame(game)}
                  onAnalyze={(selected) => {
                    setExplicitGameKeys(selected.map((game) => game.key));
                    setTab("analysis");
                  }}
                  onSync={card.sessions?.length ? () => void sync() : undefined}
                  syncing={syncing}
                  playerName={card.name}
                />
              </Tabs.Panel>
              <Tabs.Panel value="openings" style={{ flex: 1, minHeight: 0 }}>
                <OpeningsTab
                  games={games}
                  onShowGames={(opening) => {
                    setGamesSearch((previous) => ({
                      value: opening,
                      version: previous.version + 1,
                    }));
                    setTab("games");
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="preparation" style={{ flex: 1, minHeight: 0 }}>
                <PreparationTab
                  games={games}
                  name={card.name}
                  cardId={card.id}
                  profileId={card.analysisProfileId}
                  isSelf={card.kind === "self"}
                  engine={engine}
                  onOpenGame={(game, ply) => openProfileGame(game, ply)}
                />
              </Tabs.Panel>
              {trainingOwner && (
                <Tabs.Panel value="training" style={{ flex: 1, minHeight: 0 }}>
                  <TrainingTab
                    owner={trainingOwner}
                    name={card.name}
                    isSelf={card.kind === "self"}
                    games={games}
                    engine={engine}
                    onOpenGameAt={(databasePath, gameId, ply) =>
                      void openGame(databasePath, gameId, ply)
                    }
                    onShowOpenings={() => {
                      setPreparationSection("reality");
                      setTab("preparation");
                    }}
                  />
                </Tabs.Panel>
              )}
              <Tabs.Panel value="rivals" style={{ flex: 1, minHeight: 0 }}>
                <ScrollArea h="100%" offsetScrollbars>
                  <RivalsTab
                    games={games}
                    selfSources={selfSources}
                    isSelf={card.kind === "self"}
                    onOpenGame={(game) => openProfileGame(game)}
                  />
                </ScrollArea>
              </Tabs.Panel>
            </>
          )}
          <Tabs.Panel value="analysis" pt="xs" style={{ flex: 1, minHeight: 0 }}>
            <PlayerAnalysisPanel
              playerName={card.name}
              profileId={card.analysisProfileId}
              sources={card.sources}
              onOpenReference={openReference}
              explicitGameKeys={explicitGameKeys}
              onClearExplicitGames={() => setExplicitGameKeys(null)}
              onAddToMistakes={
                trainingOwner
                  ? (critical) => {
                      updateQueues((current) =>
                        withOwnerQueue(current, trainingOwner, (queue) => {
                          const { queue: next, added } = addMistakes(queue, [critical]);
                          notifications.show({
                            color: added ? "green" : "gray",
                            message: added
                              ? t("Mistakes.AddedOne", "Added to My mistakes.")
                              : t(
                                  "Mistakes.AlreadyThere",
                                  "That position is already in the queue.",
                                ),
                          });
                          return next;
                        }),
                      );
                    }
                  : undefined
              }
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </EngineAnalysisContext.Provider>
  );
}

function FilterBar({
  filters,
  setFilters,
  timeControls,
  shown,
  total,
}: {
  filters: ProfileFilters;
  setFilters: (filters: ProfileFilters) => void;
  timeControls: ReturnType<typeof timeControlsOf>;
  shown: number;
  total: number;
}) {
  const { t } = useTranslation();
  return (
    <Group gap="sm" py="sm" wrap="wrap">
      {/* Several time controls at once (blitz and rapid…); "all" clears the choice. */}
      <Chip.Group
        multiple
        value={filters.timeControls.length === 0 ? ["all"] : filters.timeControls}
        onChange={(values) => {
          const added = values.find(
            (value) =>
              !(filters.timeControls.length === 0 ? ["all"] : filters.timeControls).includes(
                value as never,
              ),
          );
          const next = added === "all" ? [] : values.filter((value) => value !== "all");
          setFilters({ ...filters, timeControls: next as ProfileFilters["timeControls"] });
        }}
      >
        <Group gap={6}>
          <Chip value="all" size="xs" variant="light">
            {t("Players.Filter.AllTimeControls", "All time controls")}
          </Chip>
          {timeControls.slice(0, 6).map(({ value, count }) => (
            <Chip key={value} value={value} size="xs" variant="light">
              {`${timeControlLabel(value, t)} · ${count}`}
            </Chip>
          ))}
        </Group>
      </Chip.Group>
      <SegmentedControl
        size="xs"
        value={filters.period}
        onChange={(value) => setFilters({ ...filters, period: value as ProfileFilters["period"] })}
        data={[
          { value: "all", label: t("Players.Filter.AllTime", "All time") },
          { value: "12m", label: t("Players.Filter.Year", "12 months") },
          { value: "3m", label: t("Players.Filter.Quarter", "3 months") },
        ]}
      />
      <SegmentedControl
        size="xs"
        value={filters.color}
        onChange={(value) => setFilters({ ...filters, color: value as ProfileFilters["color"] })}
        data={[
          { value: "any", label: t("Players.Filter.BothColors", "Both colors") },
          { value: "white", label: t("Fen.White", "White") },
          { value: "black", label: t("Fen.Black", "Black") },
        ]}
      />
      <Select
        size="xs"
        w={150}
        allowDeselect={false}
        value={String(filters.last ?? 0)}
        onChange={(value) => setFilters({ ...filters, last: Number(value) || null })}
        data={[
          { value: "0", label: t("Players.Filter.AllGames", "All games") },
          ...[20, 50, 100, 200, 500].map((count) => ({
            value: String(count),
            label: t("Players.Filter.Last", "Last {{count}}", { count }),
          })),
        ]}
      />
      {shown !== total && (
        <Group gap={6}>
          <IconChartBar size={14} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            {t("Players.Filter.Shown", "{{shown}} of {{total}} games", { shown, total })}
          </Text>
        </Group>
      )}
    </Group>
  );
}
