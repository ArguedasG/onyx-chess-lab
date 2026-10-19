import {
  Avatar,
  Badge,
  Button,
  Chip,
  Group,
  Modal,
  Paper,
  RangeSlider,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconSearch, IconUsers } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { humanBotHistoryAtom } from "@/state/atoms";
import type { BotOpeningStyleId, BotPlayStyleId } from "@/utils/botCatalogSpecs";
import { BOT_OPENING_FAMILIES, type BotOpeningFamilyId } from "@/utils/botOpenings";
import { botRatingAt, rhythmOfClock, type ClockSetting } from "@/utils/botRating";
import { formatChessPoints, getHumanBotScore } from "@/utils/humanBotHistory";
import {
  HUMAN_BOT_PROFILES,
  type HumanBotProfile,
  humanBotOpeningStyle,
  humanBotPlayStyle,
} from "@/utils/humanBots";
import { initials } from "@/components/players/common";
import { useRhythmLabel } from "./RatedGameSelector";

const PLAY_STYLES: readonly BotPlayStyleId[] = [
  "rematador",
  "salvaje",
  "guardian",
  "acechador",
  "equilibrista",
];
const OPENING_STYLES: readonly BotOpeningStyleId[] = [
  "aventurero",
  "esgrimista",
  "practico",
  "clasico",
];
const PLAY_COLORS: Record<BotPlayStyleId, string> = {
  rematador: "red",
  salvaje: "orange",
  guardian: "blue",
  acechador: "violet",
  equilibrista: "gray",
};
const MIN_ELO = 800;
const MAX_ELO = 2800;

export function usePersonalityLabels() {
  const { t } = useTranslation();
  const play: Record<BotPlayStyleId, { name: string; description: string }> = {
    rematador: {
      name: t("HumanBots.Play.Rematador", "Striker"),
      description: t(
        "HumanBots.Play.Rematador.Desc",
        "Aggressive and simplifying: attacks and trades.",
      ),
    },
    salvaje: {
      name: t("HumanBots.Play.Salvaje", "Savage"),
      description: t(
        "HumanBots.Play.Salvaje.Desc",
        "Aggressive and complicating: attacks and keeps the tension.",
      ),
    },
    guardian: {
      name: t("HumanBots.Play.Guardian", "Guardian"),
      description: t(
        "HumanBots.Play.Guardian.Desc",
        "Defensive and simplifying: safe king, trades, long games.",
      ),
    },
    acechador: {
      name: t("HumanBots.Play.Acechador", "Lurker"),
      description: t(
        "HumanBots.Play.Acechador.Desc",
        "Defensive and complicating: waits and keeps pieces on the board.",
      ),
    },
    equilibrista: {
      name: t("HumanBots.Play.Equilibrista", "Balancer"),
      description: t(
        "HumanBots.Play.Equilibrista.Desc",
        "No particular style: plays as Maia at its level.",
      ),
    },
  };
  const opening: Record<BotOpeningStyleId, { name: string; description: string }> = {
    aventurero: {
      name: t("HumanBots.Opening.Aventurero", "Adventurer"),
      description: t(
        "HumanBots.Opening.Aventurero.Desc",
        "Sharp openings with little theory: gambits and surprises.",
      ),
    },
    esgrimista: {
      name: t("HumanBots.Opening.Esgrimista", "Fencer"),
      description: t(
        "HumanBots.Opening.Esgrimista.Desc",
        "Sharp and theoretical: main lines that lead to a fight.",
      ),
    },
    practico: {
      name: t("HumanBots.Opening.Practico", "Practical"),
      description: t("HumanBots.Opening.Practico.Desc", "Solid systems with little theory."),
    },
    clasico: {
      name: t("HumanBots.Opening.Clasico", "Classical"),
      description: t(
        "HumanBots.Opening.Clasico.Desc",
        "Solid and theoretical: classical main lines.",
      ),
    },
  };
  const family = (id: BotOpeningFamilyId) =>
    t(`HumanBots.Family.${id}`, BOT_OPENING_FAMILIES[id].name);
  return { play, opening, family };
}

/** Opening families of a catalog bot, White first. */
function familiesOf(profile: HumanBotProfile): BotOpeningFamilyId[] {
  const families = profile.catalog?.families;
  return families ? [families.white, families.vsE4, families.vsD4] : [];
}

function BotBadges({ profile }: { profile: HumanBotProfile }) {
  const labels = usePersonalityLabels();
  const play = humanBotPlayStyle(profile);
  const opening = humanBotOpeningStyle(profile);
  return (
    <Group gap={4}>
      <Tooltip label={labels.play[play].description} multiline w={240}>
        <Badge size="sm" variant="light" color={PLAY_COLORS[play]}>
          {labels.play[play].name}
        </Badge>
      </Tooltip>
      <Tooltip label={labels.opening[opening].description} multiline w={240}>
        <Badge size="sm" variant="outline" color="gray">
          {labels.opening[opening].name}
        </Badge>
      </Tooltip>
    </Group>
  );
}

function ratingLabel(
  profile: HumanBotProfile,
  clock: ClockSetting,
  rhythmLabel: ReturnType<typeof useRhythmLabel>,
) {
  const clockRhythm = clock ? rhythmOfClock(clock) : null;
  const rhythm = clockRhythm && clockRhythm !== "bullet" ? clockRhythm : "blitz";
  return `${botRatingAt(profile.elo, rhythm)} · ${rhythmLabel(rhythm)}`;
}

/** The chosen bot in the game setup, with the button that opens the explorer. */
export function BotSummaryCard({
  profile,
  clock,
  repertoireLabel,
  clockSelector,
  onChange,
}: {
  profile: HumanBotProfile;
  clock: ClockSetting;
  repertoireLabel: string;
  /** Lets the explorer change the clock, so the ratings it shows are the ones that matter. */
  clockSelector?: ReactNode;
  onChange: (profileId: string) => void;
}) {
  const { t } = useTranslation();
  const rhythmLabel = useRhythmLabel();
  const history = useAtomValue(humanBotHistoryAtom);
  const score = getHumanBotScore(history, profile.id);
  const [opened, setOpened] = useState(false);

  return (
    <>
      <BotExplorerModal
        opened={opened}
        onClose={() => setOpened(false)}
        selectedId={profile.id}
        clock={clock}
        clockSelector={clockSelector}
        onSelect={(id) => {
          onChange(id);
          setOpened(false);
        }}
      />
      <Paper withBorder p="sm" radius="md">
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar radius="xl" color={PLAY_COLORS[humanBotPlayStyle(profile)]} variant="light">
                {initials(profile.name)}
              </Avatar>
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text fw={700} lineClamp={1}>
                  {profile.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {ratingLabel(profile, clock, rhythmLabel)}
                </Text>
              </Stack>
            </Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconUsers size={14} />}
              onClick={() => setOpened(true)}
            >
              {t("HumanBots.Explorer.Change", "Change")}
            </Button>
          </Group>
          <BotBadges profile={profile} />
          <Text size="xs" c="dimmed">
            {repertoireLabel}
          </Text>
          {score.games > 0 && (
            <Text size="xs">
              {t(
                "HumanBots.Explorer.YourScore",
                "Your score: {{player}}–{{bot}} in {{games}} games",
                {
                  player: formatChessPoints(score.playerPoints),
                  bot: formatChessPoints(score.botPoints),
                  games: score.games,
                },
              )}
            </Text>
          )}
        </Stack>
      </Paper>
    </>
  );
}

/** The bot explorer (I-49): search and filters over the whole catalog. */
function BotExplorerModal({
  opened,
  onClose,
  selectedId,
  clock,
  clockSelector,
  onSelect,
}: {
  opened: boolean;
  onClose: () => void;
  selectedId: string;
  clock: ClockSetting;
  clockSelector?: ReactNode;
  onSelect: (profileId: string) => void;
}) {
  const { t } = useTranslation();
  const labels = usePersonalityLabels();
  const rhythmLabel = useRhythmLabel();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<[number, number]>([MIN_ELO, MAX_ELO]);
  const [plays, setPlays] = useState<string[]>([]);
  const [openings, setOpenings] = useState<string[]>([]);
  const [family, setFamily] = useState<string | null>(null);

  const familyOptions = useMemo(
    () =>
      (Object.keys(BOT_OPENING_FAMILIES) as BotOpeningFamilyId[])
        .filter((id) => BOT_OPENING_FAMILIES[id].kind !== "vsFlank")
        .map((id) => ({ value: id, label: labels.family(id) }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [labels],
  );

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return HUMAN_BOT_PROFILES.filter((profile) => {
      if (profile.elo < range[0] || profile.elo > range[1]) return false;
      if (plays.length > 0 && !plays.includes(humanBotPlayStyle(profile))) return false;
      if (openings.length > 0 && !openings.includes(humanBotOpeningStyle(profile))) return false;
      const families = familiesOf(profile);
      if (family && !families.includes(family as BotOpeningFamilyId)) return false;
      if (!query) return true;
      return (
        profile.name.toLowerCase().includes(query) ||
        families.some((id) => labels.family(id).toLowerCase().includes(query))
      );
    });
  }, [family, labels, openings, plays, range, search]);

  const clearFilters = () => {
    setSearch("");
    setRange([MIN_ELO, MAX_ELO]);
    setPlays([]);
    setOpenings([]);
    setFamily(null);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={<Text fw={700}>{t("HumanBots.Explorer.Title", "Choose a bot")}</Text>}
    >
      <Stack gap="sm">
        {clockSelector && (
          <Paper withBorder radius="md" p="xs">
            <Stack gap={4}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                {t("HumanBots.Explorer.Clock", "Time control (sets the ratings shown)")}
              </Text>
              {clockSelector}
            </Stack>
          </Paper>
        )}
        <Group grow align="flex-end">
          <TextInput
            leftSection={<IconSearch size={14} />}
            placeholder={t("HumanBots.Explorer.Search", "Name or opening")}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Select
            clearable
            searchable
            placeholder={t("HumanBots.Explorer.Opening", "Any opening")}
            data={familyOptions}
            value={family}
            onChange={setFamily}
          />
        </Group>
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {t("HumanBots.Explorer.Rating", "Rating {{from}}–{{to}}", {
              from: range[0],
              to: range[1],
            })}
          </Text>
          <RangeSlider
            min={MIN_ELO}
            max={MAX_ELO}
            step={50}
            minRange={0}
            value={range}
            onChange={setRange}
            label={null}
          />
        </Stack>
        <Chip.Group multiple value={plays} onChange={setPlays}>
          <Group gap={6}>
            {PLAY_STYLES.map((style) => (
              <Chip key={style} value={style} size="xs" color={PLAY_COLORS[style]}>
                {labels.play[style].name}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <Chip.Group multiple value={openings} onChange={setOpenings}>
          <Group gap={6}>
            {OPENING_STYLES.map((style) => (
              <Chip key={style} value={style} size="xs" variant="outline">
                {labels.opening[style].name}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {t("HumanBots.Explorer.Count", "{{shown}} of {{total}} bots", {
              shown: shown.length,
              total: HUMAN_BOT_PROFILES.length,
            })}
          </Text>
          <Button size="compact-xs" variant="subtle" onClick={clearFilters}>
            {t("HumanBots.Explorer.Clear", "Clear filters")}
          </Button>
        </Group>
        <ScrollArea.Autosize mah="55vh" offsetScrollbars>
          {shown.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {t("HumanBots.Explorer.Empty", "No bot matches these filters.")}
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
              {shown.map((profile) => (
                <UnstyledButton key={profile.id} onClick={() => onSelect(profile.id)}>
                  <Paper
                    withBorder
                    p="xs"
                    radius="md"
                    h="100%"
                    style={
                      profile.id === selectedId
                        ? { borderColor: "var(--mantine-primary-color-filled)", borderWidth: 2 }
                        : undefined
                    }
                  >
                    <Stack gap={6}>
                      <Group gap="xs" wrap="nowrap">
                        <Avatar
                          size="sm"
                          radius="xl"
                          color={PLAY_COLORS[humanBotPlayStyle(profile)]}
                          variant="light"
                        >
                          {initials(profile.name)}
                        </Avatar>
                        <Stack gap={0} style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} lineClamp={1}>
                            {profile.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {ratingLabel(profile, clock, rhythmLabel)}
                          </Text>
                        </Stack>
                      </Group>
                      <BotBadges profile={profile} />
                      {familiesOf(profile).length > 0 && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {familiesOf(profile).map(labels.family).join(" · ")}
                        </Text>
                      )}
                    </Stack>
                  </Paper>
                </UnstyledButton>
              ))}
            </SimpleGrid>
          )}
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
}

/** The repertoire of a catalog bot as its families, White first. */
export function useCatalogRepertoireLabel() {
  const labels = usePersonalityLabels();
  return (profile: HumanBotProfile) => familiesOf(profile).map(labels.family).join(" · ");
}
