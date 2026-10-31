import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Menu,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  IconChevronDown,
  IconDeviceFloppy,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MaiaRequiredAlert from "@/components/common/MaiaRequiredAlert";
import {
  activeTabAtom,
  gameInputColorAtom,
  gamePlayer1SettingsAtom,
  gamePlayer2SettingsAtom,
  tabsAtom,
} from "@/state/atoms";
import { twinDraftsAtom, useSavedTwins } from "@/state/savedTwins";
import { twinStylesAtom } from "@/state/twinBots";
import { DEFAULT_HUMAN_BOT_PROFILE_ID } from "@/utils/humanBots";
import type { ProfileGame } from "@/utils/players/profileGames";
import { BOOK_PLIES } from "@/utils/preparation/book";
import {
  gamesOfProfile,
  type SavedTwin,
  TWIN_PROFILE_KEYS,
  TWIN_PROFILE_MIN_GAMES,
  type TwinProfile,
  type TwinProfileKey,
  type TwinTimingMode,
} from "@/utils/preparation/savedTwins";
import { buildTwin } from "@/utils/preparation/twinBuilder";
import type { GeneratorColor } from "@/utils/repertoireGenerator/types";
import { createTab } from "@/utils/tabs";
import { DEFAULT_TIME_CONTROL } from "../../boards/OpponentForm";
import { SectionHeader, usePreparationEngines } from "./common";
import { colorName } from "./labels";
import { useProfileLabel } from "./twinLabels";
import { TwinThinkingCard } from "./TwinBehaviour";
import TwinFidelityCard from "./TwinFidelityCard";
import TwinProfileEditor, { OriginBadge } from "./TwinProfileEditor";

/** Games of the book offered: all, or the most recent N with each color. */
const RECENT_OPTIONS = [null, 200, 100, 50, 25] as const;

/**
 * The twin of a player (I-43, 9.3 extension): one profile per rhythm and a general one, saved,
 * edited by hand, measured or autotuned on the player's games, and updated when there are newer
 * ones. An unsaved twin can be played during the session.
 */
export default function TwinSection({
  games,
  name,
  cardId,
}: {
  /** The card's games with every rhythm: each profile takes its own. */
  games: ProfileGame[];
  name: string;
  cardId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profileLabel = useProfileLabel();
  const { maia } = usePreparationEngines();
  const { twins, save, remove } = useSavedTwins();
  const [drafts, setDrafts] = useAtom(twinDraftsAtom);
  const legacyStyle = useAtomValue(twinStylesAtom)[cardId]?.measurement;
  const setPlayer1 = useSetAtom(gamePlayer1SettingsAtom);
  const setPlayer2 = useSetAtom(gamePlayer2SettingsAtom);
  const setInputColor = useSetAtom(gameInputColorAtom);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const saved = useMemo(
    () => (twins ?? []).filter((twin) => twin.cardId === cardId),
    [cardId, twins],
  );
  const draft = useMemo(
    () => Object.values(drafts).find((twin) => twin.cardId === cardId) ?? null,
    [cardId, drafts],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const twin =
    saved.find((entry) => entry.id === selectedId) ??
    (draft && draft.id === selectedId ? draft : null) ??
    saved[0] ??
    draft;
  const isSaved = Boolean(twin && saved.some((entry) => entry.id === twin.id));
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [profileKey, setProfileKey] = useState<TwinProfileKey>("general");
  const [color, setColor] = useState<GeneratorColor>("white");
  const [playProfile, setPlayProfile] = useState<TwinProfileKey | "auto">("auto");

  async function build(previous?: SavedTwin, bookRecent?: number | null) {
    setBuilding(true);
    setBuildError(null);
    try {
      const next = await buildTwin({
        games,
        cardId,
        playerName: name,
        previous,
        bookRecent,
      });
      // The style measured with 9.3 seeds a new twin's general profile.
      const general = next.profiles.general;
      if (!previous && general && legacyStyle?.improves) {
        next.profiles.general = {
          ...general,
          play: {
            ...general.play,
            aggression: legacyStyle.weightsAggression,
            simplification: legacyStyle.weightsSimplification,
          },
          origin: "measured",
        };
      }
      if (previous && isSaved) save(next);
      else setDrafts((current) => ({ ...withoutCardDraft(current, cardId), [next.id]: next }));
      setSelectedId(next.id);
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : String(error));
    } finally {
      setBuilding(false);
    }
  }

  // A card with no twin yet gets an unsaved one to look at and play.
  const loaded = twins !== null;
  useEffect(() => {
    if (loaded && saved.length === 0 && !draft && !building && games.length > 0) void build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, saved.length, draft, games.length]);

  const profile: TwinProfile | undefined =
    twin?.profiles[profileKey] ?? twin?.profiles.general ?? undefined;
  useEffect(() => {
    if (twin && !twin.profiles[profileKey]) setProfileKey("general");
  }, [profileKey, twin]);
  const profileGames = useMemo(
    () => gamesOfProfile(games, profile?.key ?? "general"),
    [games, profile?.key],
  );

  function change(next: SavedTwin) {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    if (isSaved) save(stamped);
    else setDrafts((current) => ({ ...current, [stamped.id]: stamped }));
  }

  function changeProfile(next: TwinProfile) {
    if (!twin) return;
    change({ ...twin, profiles: { ...twin.profiles, [next.key]: next } });
  }

  function saveDraft() {
    if (!twin || isSaved) return;
    save(twin);
    setDrafts((current) => withoutCardDraft(current, cardId));
    setSelectedId(twin.id);
  }

  async function confirmDelete() {
    if (!twin) return;
    const confirmed = await ask(
      t(
        "Preparation.Twin.DeleteConfirm",
        "Delete «{{name}}» and its measurements? The player's games are not touched.",
        { name: twin.name },
      ),
      { kind: "warning" },
    );
    if (!confirmed) return;
    remove(twin.id);
    setSelectedId(null);
  }

  async function play() {
    if (!maia || !twin) return;
    // Unsaved twins are found by the board among the drafts.
    if (!isSaved) setDrafts((current) => ({ ...current, [twin.id]: twin }));
    setInputColor(color === "white" ? "black" : "white");
    setPlayer1({
      type: "human",
      name: t("Preparation.Twin.You", "You"),
      timeControl: DEFAULT_TIME_CONTROL,
      timeUnit: "m",
      incrementUnit: "s",
    });
    setPlayer2({
      type: "humanBot",
      engine: maia,
      profileId: DEFAULT_HUMAN_BOT_PROFILE_ID,
      humanTiming: twin.timing !== "none",
      timeControl: DEFAULT_TIME_CONTROL,
      timeUnit: "m",
      incrementUnit: "s",
      twin: {
        id: twin.id,
        name: twin.name,
        elo: twin.profiles.general?.play.elo ?? 1500,
        profile: playProfile,
      },
    });
    await createTab({
      tab: {
        name: t("Preparation.Twin.Name", "Twin of {{name}}", { name: twin.name }),
        type: "play",
      },
      setTabs,
      setActiveTab,
    });
    navigate({ to: "/" });
  }

  const profileKeys = TWIN_PROFILE_KEYS.filter((key) => twin?.profiles[key]);
  const sequences = profile ? profile.books[color].length : 0;

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconRobot size={18} />}
        title={t("Preparation.Twin.Title", "Play against the twin")}
        description={t(
          "Preparation.Twin.Description",
          "A bot that plays {{name}}'s repertoire (the opening sequences of these games, with their real frequency) and, out of it, like a player of that rating, with {{name}}'s think time and the style it is given. Each rhythm with at least {{count}} games has its own profile; a game uses the one of its clock.",
          { name, count: TWIN_PROFILE_MIN_GAMES },
        )}
      />

      {!maia && (
        <MaiaRequiredAlert>
          {t(
            "Preparation.Twin.NoMaia",
            "The twin needs Maia 3. Install it from Engines (managed installation).",
          )}
        </MaiaRequiredAlert>
      )}

      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="sm" wrap="wrap">
              {saved.length + (draft ? 1 : 0) > 1 && (
                <Select
                  size="xs"
                  w={220}
                  allowDeselect={false}
                  value={twin?.id ?? null}
                  onChange={(value) => setSelectedId(value)}
                  data={[
                    ...saved.map((entry) => ({ value: entry.id, label: entry.name })),
                    ...(draft
                      ? [
                          {
                            value: draft.id,
                            label: t("Preparation.Twin.DraftLabel", "{{name}} (not saved)", {
                              name: draft.name,
                            }),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
              {twin && (
                <TextInput
                  size="xs"
                  w={220}
                  aria-label={t("Preparation.Twin.TwinName", "Twin name")}
                  value={twin.name}
                  onChange={(event) => change({ ...twin, name: event.currentTarget.value })}
                />
              )}
              {twin && !isSaved && (
                <Badge variant="light" color="yellow">
                  {t("Preparation.Twin.NotSaved", "Not saved: it goes away when Onyx closes")}
                </Badge>
              )}
            </Group>
            <Group gap="xs">
              {twin && !isSaved && (
                <Button size="xs" leftSection={<IconDeviceFloppy size={14} />} onClick={saveDraft}>
                  {t("Preparation.Twin.Save", "Save twin")}
                </Button>
              )}
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Button
                    size="xs"
                    variant="default"
                    rightSection={<IconChevronDown size={14} />}
                    disabled={building || games.length === 0}
                  >
                    {t("Preparation.Twin.Actions", "Twin")}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {twin && (
                    <Menu.Item
                      leftSection={<IconRefresh size={14} />}
                      onClick={() => void build(twin)}
                    >
                      {t("Preparation.Twin.Update", "Update with the current games")}
                    </Menu.Item>
                  )}
                  <Menu.Item leftSection={<IconPlus size={14} />} onClick={() => void build()}>
                    {t("Preparation.Twin.New", "New twin from the current games")}
                  </Menu.Item>
                  {twin && isSaved && (
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={() => void confirmDelete()}
                    >
                      {t("Preparation.Twin.Delete", "Delete twin")}
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>

          {building && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                {t("Preparation.Twin.Building", "Reading the books of each rhythm…")}
              </Text>
            </Group>
          )}
          {buildError && <Alert color="red">{buildError}</Alert>}

          {twin && (
            <>
              <Text size="xs" c="dimmed">
                {t(
                  "Preparation.Twin.BuiltFrom",
                  "From {{games}} games (the card's filters except the rhythm), up to {{day}}; updated on {{updated}}. «Update» reads the card's games again and keeps the settings and measurements of each profile.",
                  {
                    games: twin.gamesUsed,
                    day: twin.lastDay ?? "—",
                    updated: twin.updatedAt.slice(0, 10),
                  },
                )}
              </Text>
              <Group gap="md" align="flex-end" wrap="wrap">
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    {t("Preparation.Twin.TwinPlays", "The twin plays")}
                  </Text>
                  <SegmentedControl
                    size="xs"
                    value={color}
                    onChange={(value) => setColor(value as GeneratorColor)}
                    data={(["white", "black"] as const).map((value) => ({
                      value,
                      label: colorName(value, t),
                    }))}
                  />
                </Stack>
                <Select
                  size="xs"
                  w={200}
                  label={t("Preparation.Twin.PlayProfile", "Profile in the game")}
                  allowDeselect={false}
                  value={playProfile}
                  onChange={(value) => setPlayProfile((value ?? "auto") as TwinProfileKey | "auto")}
                  data={[
                    {
                      value: "auto",
                      label: t("Preparation.Twin.AutoProfile", "By the game's clock"),
                    },
                    ...profileKeys.map((key) => ({ value: key, label: profileLabel(key) })),
                  ]}
                />
                <Button
                  leftSection={<IconPlayerPlay size={16} />}
                  disabled={!maia || twin.gamesUsed === 0}
                  onClick={() => void play()}
                >
                  {t("Preparation.Twin.Play", "Play against the twin")}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Paper>

      {twin && profile && (
        <>
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" wrap="wrap" gap="sm">
                <SegmentedControl
                  size="xs"
                  value={profile.key}
                  onChange={(value) => setProfileKey(value as TwinProfileKey)}
                  data={profileKeys.map((key) => ({
                    value: key,
                    label: `${profileLabel(key)} · ${twin.profiles[key]!.games}`,
                  }))}
                />
                <OriginBadge origin={profile.origin} />
              </Group>
              <Text size="xs" c="dimmed">
                {profile.key === "general"
                  ? t(
                      "Preparation.Twin.GeneralHint",
                      "Every game, whatever the rhythm: used without a clock, or when no rhythm has a profile of its own.",
                    )
                  : t(
                      "Preparation.Twin.RhythmHint",
                      "Only the {{rhythm}} games: their book, rating and style are used in games at that rhythm.",
                      { rhythm: profileLabel(profile.key).toLowerCase() },
                    )}
              </Text>
              <Group gap="xs">
                <Badge variant="light">
                  {t(
                    "Preparation.Twin.ProfileGames",
                    "{{white}} with White · {{black}} with Black",
                    {
                      white: profile.white,
                      black: profile.black,
                    },
                  )}
                </Badge>
                <Badge variant="light" color="gray">
                  {t("Preparation.Twin.Sequences", "{{count}} sequences", { count: sequences })}
                </Badge>
              </Group>
            </Stack>
          </Paper>

          <TwinProfileEditor
            profile={profile}
            games={profileGames}
            name={name}
            maia={maia}
            onChange={changeProfile}
          />

          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Paper withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text fw={700}>{t("Preparation.Twin.Book", "Book")}</Text>
                <Text size="xs" c="dimmed">
                  {t(
                    "Preparation.Twin.BookHint",
                    "The opening sequences of the games of each profile, chosen with their real frequency. With only the most recent games the twin plays its current repertoire.",
                  )}
                </Text>
                <Group gap="md" wrap="wrap" align="flex-end">
                  <NumberInput
                    size="xs"
                    w={160}
                    label={t("Preparation.Twin.BookMoves", "Moves of the book")}
                    min={1}
                    max={BOOK_PLIES / 2}
                    value={twin.bookPlies / 2}
                    onChange={(value) =>
                      typeof value === "number" &&
                      change({
                        ...twin,
                        bookPlies: Math.max(2, Math.min(BOOK_PLIES, Math.round(value) * 2)),
                      })
                    }
                  />
                  <Select
                    size="xs"
                    w={220}
                    label={t("Preparation.Twin.BookGames", "Games of the book")}
                    allowDeselect={false}
                    disabled={building}
                    value={String(twin.bookRecent ?? "all")}
                    onChange={(value) =>
                      void build(twin, value === "all" || !value ? null : Number(value))
                    }
                    data={RECENT_OPTIONS.map((value) => ({
                      value: String(value ?? "all"),
                      label:
                        value === null
                          ? t("Preparation.Twin.AllGames", "All")
                          : t("Preparation.Twin.RecentGames", "Last {{count}} with each color", {
                              count: value,
                            }),
                    }))}
                  />
                </Group>
                <SegmentedControl
                  size="xs"
                  value={twin.timing}
                  onChange={(value) => change({ ...twin, timing: value as TwinTimingMode })}
                  data={[
                    {
                      value: "player",
                      label: t("Preparation.Twin.TimingPlayer", "Their think time"),
                    },
                    {
                      value: "catalog",
                      label: t("Preparation.Twin.TimingCatalog", "Think time of its rating"),
                    },
                    { value: "none", label: t("Preparation.Twin.TimingNone", "Instant") },
                  ]}
                />
              </Stack>
            </Paper>
            <TwinThinkingCard games={games} name={name} />
          </SimpleGrid>

          <TwinFidelityCard
            games={profileGames}
            color={color}
            elo={profile.play.elo}
            name={name}
            maia={maia}
          />
        </>
      )}
    </Stack>
  );
}

function withoutCardDraft(drafts: Record<string, SavedTwin>, cardId: string) {
  return Object.fromEntries(Object.entries(drafts).filter(([, twin]) => twin.cardId !== cardId));
}
