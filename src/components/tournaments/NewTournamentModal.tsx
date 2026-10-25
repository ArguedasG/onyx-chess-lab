import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Chip,
  Collapse,
  Group,
  NumberInput,
  Paper,
  RangeSlider,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import {
  IconAdjustments,
  IconArrowsShuffle,
  IconChevronDown,
  IconChevronRight,
  IconInfoCircle,
  IconPlus,
  IconTournament,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClockPresets } from "@/components/boards/BotGameSetup";
import {
  BotBadges,
  BotExplorerModal,
  OPENING_STYLES,
  PLAY_COLORS,
  PLAY_STYLES,
  usePersonalityLabels,
} from "@/components/boards/BotPicker";
import { findObjectiveEngine } from "@/components/boards/EndgameObjectiveWatch";
import { useRatedBlockerText, useRhythmLabel } from "@/components/boards/RatedGameSelector";
import { initials } from "@/components/players/common";
import { botRatingsAtom, enginesAtom } from "@/state/atoms";
import type { BotOpeningStyleId, BotPlayStyleId } from "@/utils/botCatalogSpecs";
import { BOT_OPENING_FAMILIES, type BotOpeningFamilyId } from "@/utils/botOpenings";
import { EMPTY_BOT_RATINGS, isProvisional, ratedGameBlocker } from "@/utils/botRating";
import { getHumanBotProfile, humanBotPlayStyle } from "@/utils/humanBots";
import { createTournament } from "@/utils/tournaments/engine";
import {
  buildField,
  DEFAULT_LEVEL_RANGE,
  FIELD_SIZES,
  type FieldFilters,
  templateFilters,
} from "@/utils/tournaments/templates";
import type {
  Tournament,
  TournamentFormat,
  TournamentParticipant,
  TournamentTemplate,
} from "@/utils/tournaments/types";
import { defaultSwissRounds, entrantFor, newSeed, newTournamentId, userEntrant } from "./creation";
import {
  clockLabel,
  EXPERIMENTAL_TEMPLATES,
  MAIN_TEMPLATES,
  TEMPLATE_COLORS,
  TEMPLATE_ICONS,
  tournamentRhythm,
  useTournamentLabels,
} from "./labels";
import { useTournamentUserName } from "./useTournamentGameLauncher";

const FORMATS: readonly TournamentFormat[] = [
  "swiss",
  "roundRobin",
  "knockout",
  "doubleElimination",
];
const DEFAULT_CLOCK = { seconds: 300_000, increment: 3000 };

function SelectableCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <UnstyledButton onClick={onClick} style={{ height: "100%" }}>
      <Paper
        withBorder
        radius="md"
        p="sm"
        h="100%"
        style={
          selected
            ? {
                borderColor: "var(--mantine-primary-color-filled)",
                boxShadow: "0 0 0 1px var(--mantine-primary-color-filled)",
                background: "var(--mantine-primary-color-light)",
              }
            : undefined
        }
      >
        {children}
      </Paper>
    </UnstyledButton>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" fw={700} tt="uppercase" c="dimmed">
      {children}
    </Text>
  );
}

/**
 * Creating a tournament in three steps: who the opponents are (a template written from the
 * user's point of view), how it is played, and the field, which can be adjusted by hand.
 */
export default function NewTournamentModal({
  opened,
  onClose,
  initialTemplate,
  onCreate,
}: {
  opened: boolean;
  onClose: () => void;
  initialTemplate: TournamentTemplate | null;
  onCreate: (tournament: Tournament) => void;
}) {
  const { t } = useTranslation();
  const labels = useTournamentLabels();
  const personality = usePersonalityLabels();
  const rhythmLabel = useRhythmLabel();
  const blockerText = useRatedBlockerText();
  const userName = useTournamentUserName();
  const ratings = useAtomValue(botRatingsAtom) ?? EMPTY_BOT_RATINGS;
  const engines = useAtomValue(enginesAtom);
  const verifier = useMemo(() => findObjectiveEngine(engines), [engines]);

  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<TournamentTemplate>(initialTemplate ?? "myLevel");
  const [levelRange, setLevelRange] = useState(DEFAULT_LEVEL_RANGE);
  const [family, setFamily] = useState<BotOpeningFamilyId | null>(null);
  const [play, setPlay] = useState<BotPlayStyleId>("salvaje");
  const [format, setFormat] = useState<TournamentFormat>("swiss");
  const [players, setPlayers] = useState<number>(FIELD_SIZES.swiss.default);
  const [swissRounds, setSwissRounds] = useState<number | null>(null);
  const [doubleRoundRobin, setDoubleRoundRobin] = useState(false);
  const [gamesPerMatch, setGamesPerMatch] = useState(1);
  const [clock, setClock] = useState(DEFAULT_CLOCK);
  const [rated, setRated] = useState(true);
  const [ratingOverride, setRatingOverride] = useState<number | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [seed, setSeed] = useState(newSeed);
  const [filters, setFilters] = useState<FieldFilters | null>(null);
  const [filtersOpened, setFiltersOpened] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [explorerOpened, setExplorerOpened] = useState(false);

  // Every opening of the modal starts from scratch, on the template it was opened with.
  useEffect(() => {
    if (!opened) return;
    setStep(initialTemplate ? 1 : 0);
    setTemplate(initialTemplate ?? "myLevel");
    setName(null);
    setSeed(newSeed());
    setRemoved([]);
    setAdded([]);
    setFilters(null);
  }, [initialTemplate, opened]);

  const rhythm = tournamentRhythm(clock);
  const ownRating = ratings.ratings[rhythm];
  const userRating = ratingOverride ?? Math.round(ownRating.rating);
  const templateOptions = { levelRange, family, play };
  const baseFilters = templateFilters(template, userRating, templateOptions);
  const activeFilters = filters ?? baseFilters;
  const blocker = ratedGameBlocker({
    againstCatalogBot: true,
    fromStartPosition: true,
    playerClock: clock,
    botClock: clock,
    openingBook: false,
    verifier: verifier !== null,
  });
  const sizes = FIELD_SIZES[format];
  const effectiveRounds = swissRounds ?? defaultSwissRounds(players);

  // Cheap enough to rebuild on every change: a few thousand comparisons at most.
  const field = [
    ...added.map((id) => entrantFor(id, rhythm)),
    ...buildField({
      template,
      opponents: Math.max(0, players - 1 - added.length),
      userRating,
      rhythm,
      filters: activeFilters,
      seed,
      exclude: [...removed, ...added],
    }),
  ].sort((left, right) => right.rating - left.rating);

  const defaultName = `${labels.templates[template].name} · ${labels.formats[format].name}`;
  const average =
    field.length > 0
      ? Math.round(field.reduce((sum, p) => sum + p.rating, 0) / field.length)
      : null;
  const userRank = field.filter((entrant) => entrant.rating > userRating).length + 1;
  const tooSmall = field.length + 1 < sizes.min;
  const needsFamily = template === "specialists" && !family;

  const changeFormat = (value: TournamentFormat) => {
    setFormat(value);
    setPlayers(FIELD_SIZES[value].default);
    setSwissRounds(null);
  };

  const create = () => {
    const now = new Date().toISOString();
    const tournament = createTournament({
      id: newTournamentId(),
      name: (name ?? defaultName).trim() || defaultName,
      format,
      template,
      clock,
      rated: rated && blocker === null,
      seed,
      participants: [userEntrant(userName, userRating), ...field],
      doubleRoundRobin,
      swissRounds: effectiveRounds,
      gamesPerMatch,
      now,
    });
    onCreate(tournament);
  };

  const familyOptions = useMemo(
    () =>
      (Object.keys(BOT_OPENING_FAMILIES) as BotOpeningFamilyId[])
        .filter((id) => BOT_OPENING_FAMILIES[id].kind !== "vsFlank")
        .map((id) => ({ value: id, label: personality.family(id) }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [personality],
  );

  const templateCard = (id: TournamentTemplate) => {
    const Icon = TEMPLATE_ICONS[id];
    return (
      <SelectableCard
        key={id}
        selected={template === id}
        onClick={() => {
          setTemplate(id);
          setFilters(null);
        }}
      >
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon variant="light" color={TEMPLATE_COLORS[id]} radius="md" size="lg">
            <Icon size={20} />
          </ThemeIcon>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={600} size="sm">
              {labels.templates[id].name}
            </Text>
            <Text size="xs" c="dimmed">
              {id === "myLevel"
                ? t(
                    "Tournaments.Template.MyLevel.Desc",
                    "Opponents within ±{{range}} of your rating. The fairest fight.",
                    { range: levelRange },
                  )
                : labels.templates[id].description}
            </Text>
          </Stack>
        </Group>
      </SelectableCard>
    );
  };

  const templateStep = (
    <Stack gap="md">
      <SimpleGrid cols={2} spacing="sm">
        {MAIN_TEMPLATES.map(templateCard)}
      </SimpleGrid>
      <SectionLabel>{t("Tournaments.Template.Experimental", "Experimental")}</SectionLabel>
      <SimpleGrid cols={2} spacing="sm">
        {[...EXPERIMENTAL_TEMPLATES, "custom" as const].map(templateCard)}
      </SimpleGrid>
      {template === "myLevel" && (
        <NumberInput
          label={t("Tournaments.Template.MyLevel.Range", "Rating margin (±)")}
          description={t(
            "Tournaments.Template.MyLevel.RangeDesc",
            "How far from your rating an opponent can be.",
          )}
          min={25}
          max={400}
          step={25}
          value={levelRange}
          onChange={(value) => typeof value === "number" && setLevelRange(value)}
          maw={260}
        />
      )}
      {template === "specialists" && (
        <Select
          searchable
          label={t("Tournaments.Template.Specialists.Opening", "Opening everyone plays")}
          placeholder={t("Tournaments.Template.Specialists.Pick", "Choose an opening")}
          data={familyOptions}
          value={family}
          onChange={(value) => setFamily(value as BotOpeningFamilyId | null)}
          maw={360}
        />
      )}
      {template === "sameStyle" && (
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            {t("Tournaments.Template.SameStyle.Pick", "Personality of every opponent")}
          </Text>
          <Chip.Group value={play} onChange={(value) => setPlay(value as BotPlayStyleId)}>
            <Group gap={6}>
              {PLAY_STYLES.map((style) => (
                <Tooltip key={style} label={personality.play[style].description} multiline w={240}>
                  <div>
                    <Chip value={style} size="sm" color={PLAY_COLORS[style]}>
                      {personality.play[style].name}
                    </Chip>
                  </div>
                </Tooltip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
      )}
    </Stack>
  );

  const formatStep = (
    <Stack gap="md">
      <SimpleGrid cols={2} spacing="sm">
        {FORMATS.map((id) => (
          <SelectableCard key={id} selected={format === id} onClick={() => changeFormat(id)}>
            <Stack gap={2}>
              <Text fw={600} size="sm">
                {labels.formats[id].name}
              </Text>
              <Text size="xs" c="dimmed">
                {labels.formats[id].description}
              </Text>
            </Stack>
          </SelectableCard>
        ))}
      </SimpleGrid>
      <Group grow align="flex-start">
        <NumberInput
          label={t("Tournaments.Players", "Players")}
          description={t("Tournaments.Players.Desc", "You included, {{min}}–{{max}}", {
            min: sizes.min,
            max: sizes.max,
          })}
          min={sizes.min}
          max={sizes.max}
          value={players}
          onChange={(value) =>
            typeof value === "number" &&
            setPlayers(Math.max(sizes.min, Math.min(sizes.max, Math.round(value))))
          }
        />
        {format === "swiss" && (
          <NumberInput
            label={t("Tournaments.Rounds", "Rounds")}
            description={t("Tournaments.Rounds.Desc", "Games you will play")}
            min={1}
            max={Math.min(15, players - 1)}
            value={effectiveRounds}
            onChange={(value) => typeof value === "number" && setSwissRounds(Math.round(value))}
          />
        )}
        {format === "roundRobin" && (
          <Switch
            mt="xl"
            checked={doubleRoundRobin}
            onChange={(event) => setDoubleRoundRobin(event.currentTarget.checked)}
            label={t("Tournaments.DoubleRoundRobin", "Double round (both colors)")}
          />
        )}
        {(format === "knockout" || format === "doubleElimination") && (
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t("Tournaments.GamesPerMatch", "Games per match")}
            </Text>
            <SegmentedControl
              value={String(gamesPerMatch)}
              onChange={(value) => setGamesPerMatch(Number(value))}
              data={[
                { value: "1", label: t("Tournaments.GamesPerMatch.One", "One game") },
                { value: "2", label: t("Tournaments.GamesPerMatch.Two", "Two games") },
              ]}
            />
          </Stack>
        )}
      </Group>
      <Stack gap={6}>
        <SectionLabel>{t("HumanBots.Setup.Clock", "Time control")}</SectionLabel>
        <ClockPresets
          clock={clock}
          allowNone={false}
          onChange={(value) =>
            value && setClock({ seconds: value.seconds, increment: value.increment ?? 0 })
          }
        />
      </Stack>
      <Paper withBorder radius="md" p="sm">
        <Stack gap="xs">
          <Switch
            checked={rated && blocker === null}
            disabled={blocker !== null}
            onChange={(event) => setRated(event.currentTarget.checked)}
            label={t("Tournaments.RatedGames", "My games count for my rating")}
            description={
              blocker
                ? blockerText[blocker]
                : t(
                    "Tournaments.RatedGames.Desc",
                    "Each game changes your {{rhythm}} rating against the bots, as a rated game would.",
                    { rhythm: rhythmLabel(rhythm).toLowerCase() },
                  )
            }
          />
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <NumberInput
              label={t("Tournaments.YourLevel", "Your level for this tournament")}
              description={
                isProvisional(ownRating)
                  ? t(
                      "Tournaments.YourLevel.Provisional",
                      "Your {{rhythm}} rating is still provisional; adjust it if you know your level.",
                      { rhythm: rhythmLabel(rhythm).toLowerCase() },
                    )
                  : t("Tournaments.YourLevel.Desc", "Your {{rhythm}} rating against the bots.", {
                      rhythm: rhythmLabel(rhythm).toLowerCase(),
                    })
              }
              min={400}
              max={3000}
              step={25}
              value={userRating}
              onChange={(value) =>
                typeof value === "number" && setRatingOverride(Math.round(value))
              }
              style={{ flex: 1 }}
            />
            {ratingOverride !== null && (
              <Button variant="subtle" size="xs" onClick={() => setRatingOverride(null)}>
                {t("Tournaments.YourLevel.Reset", "Use my rating")}
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>
      <TextInput
        label={t("Tournaments.Name", "Tournament name")}
        placeholder={defaultName}
        value={name ?? ""}
        onChange={(event) => setName(event.currentTarget.value)}
      />
    </Stack>
  );

  const updateFilters = (change: Partial<FieldFilters>) =>
    setFilters({ ...activeFilters, ...change });

  const fieldStep = (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={0}>
          <Text fw={600}>
            {t("Tournaments.Field.Summary", "{{count}} players · average {{average}}", {
              count: field.length + 1,
              average: average ?? "–",
            })}
          </Text>
          <Text size="xs" c="dimmed">
            {t("Tournaments.Field.YourSeed", "You start as seed {{rank}} with {{rating}}", {
              rank: userRank,
              rating: userRating,
            })}
          </Text>
        </Stack>
        <Group gap="xs">
          <Tooltip label={t("Tournaments.Field.Reshuffle.Desc", "Same filters, other opponents")}>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconArrowsShuffle size={14} />}
              onClick={() => {
                setSeed(newSeed());
                setRemoved([]);
              }}
            >
              {t("Tournaments.Field.Reshuffle", "Draw again")}
            </Button>
          </Tooltip>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => setExplorerOpened(true)}
          >
            {t("Tournaments.Field.Add", "Add a bot")}
          </Button>
        </Group>
      </Group>

      <UnstyledButton onClick={() => setFiltersOpened((value) => !value)}>
        <Group gap={4}>
          {filtersOpened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <IconAdjustments size={14} />
          <Text size="sm" c="dimmed">
            {t("Tournaments.Field.Filters", "Filters")}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={filtersOpened}>
        <Paper withBorder radius="md" p="sm">
          <Stack gap="sm">
            <Stack gap={4}>
              <Text size="xs" c="dimmed">
                {t("HumanBots.Explorer.Rating", "Rating {{from}}–{{to}}", {
                  from: activeFilters.range[0],
                  to: activeFilters.range[1],
                })}
              </Text>
              <RangeSlider
                min={400}
                max={3000}
                step={25}
                minRange={50}
                value={activeFilters.range}
                onChange={(range) => updateFilters({ range })}
                label={null}
              />
            </Stack>
            <Chip.Group
              multiple
              value={activeFilters.plays}
              onChange={(plays) => updateFilters({ plays: plays as BotPlayStyleId[] })}
            >
              <Group gap={6}>
                {PLAY_STYLES.map((style) => (
                  <Chip key={style} value={style} size="xs" color={PLAY_COLORS[style]}>
                    {personality.play[style].name}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <Chip.Group
              multiple
              value={activeFilters.openings}
              onChange={(openings) => updateFilters({ openings: openings as BotOpeningStyleId[] })}
            >
              <Group gap={6}>
                {OPENING_STYLES.map((style) => (
                  <Chip key={style} value={style} size="xs" variant="outline">
                    {personality.opening[style].name}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <Group grow align="flex-end">
              <Select
                clearable
                searchable
                size="xs"
                placeholder={t("HumanBots.Explorer.Opening", "Any opening")}
                data={familyOptions}
                value={activeFilters.family}
                onChange={(value) => updateFilters({ family: value as BotOpeningFamilyId | null })}
              />
              <Switch
                size="sm"
                checked={activeFilters.includeGenerated}
                onChange={(event) =>
                  updateFilters({ includeGenerated: event.currentTarget.checked })
                }
                label={t("Tournaments.Field.Generated", "Fill with generated players")}
              />
            </Group>
            {filters && (
              <Button size="compact-xs" variant="subtle" onClick={() => setFilters(null)}>
                {t("Tournaments.Field.ResetFilters", "Back to the template filters")}
              </Button>
            )}
          </Stack>
        </Paper>
      </Collapse>

      {tooSmall && (
        <Alert color="yellow" icon={<IconInfoCircle size={16} />}>
          {t(
            "Tournaments.Field.TooSmall",
            "Not enough opponents fit these filters. Widen the rating range or allow generated players.",
          )}
        </Alert>
      )}
      {!tooSmall && field.length + 1 < players && (
        <Text size="xs" c="dimmed">
          {t(
            "Tournaments.Field.Fewer",
            "Only {{count}} opponents fit these filters; the tournament will have fewer players.",
            { count: field.length },
          )}
        </Text>
      )}

      <ScrollArea.Autosize mah={340} offsetScrollbars>
        <Stack gap={4}>
          {field.map((entrant) => (
            <EntrantRow
              key={entrant.id}
              entrant={entrant}
              onRemove={() => {
                setRemoved((list) => [...list, entrant.id]);
                setAdded((list) => list.filter((id) => id !== entrant.id));
              }}
            />
          ))}
        </Stack>
      </ScrollArea.Autosize>
      <BotExplorerModal
        opened={explorerOpened}
        onClose={() => setExplorerOpened(false)}
        selectedId=""
        clock={clock}
        onSelect={(id) => {
          if (!field.some((entrant) => entrant.id === id)) {
            setAdded((list) => [...list, id]);
            setRemoved((list) => list.filter((removedId) => removedId !== id));
          }
          setExplorerOpened(false);
        }}
      />
    </Stack>
  );

  const canAdvance = step === 0 ? !needsFamily : step === 1 ? true : !tooSmall;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={760}
      title={
        <Group gap="xs">
          <IconTournament size={20} />
          <Text fw={700}>{t("Tournaments.New", "New tournament")}</Text>
        </Group>
      }
    >
      <Stack gap="lg">
        <Stepper active={step} onStepClick={setStep} size="sm" allowNextStepsSelect={false}>
          <Stepper.Step
            label={t("Tournaments.Step.Opponents", "Opponents")}
            description={labels.templates[template].name}
          >
            {templateStep}
          </Stepper.Step>
          <Stepper.Step
            label={t("Tournaments.Step.Format", "Format")}
            description={`${labels.formats[format].name} · ${clockLabel(clock)}`}
          >
            {formatStep}
          </Stepper.Step>
          <Stepper.Step
            label={t("Tournaments.Step.Field", "Players")}
            description={t("Tournaments.Step.Field.Desc", "{{count}} players", {
              count: field.length + 1,
            })}
          >
            {fieldStep}
          </Stepper.Step>
        </Stepper>
        <Group justify="space-between">
          <Button variant="default" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? t("Common.Cancel", "Cancel") : t("Tournaments.Back", "Back")}
          </Button>
          {step < 2 ? (
            <Button disabled={!canAdvance} onClick={() => setStep(step + 1)}>
              {t("Tournaments.Next", "Next")}
            </Button>
          ) : (
            <Button leftSection={<IconUsers size={16} />} disabled={!canAdvance} onClick={create}>
              {t("Tournaments.Create", "Create the tournament")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

function EntrantRow({
  entrant,
  onRemove,
}: {
  entrant: Omit<TournamentParticipant, "seed">;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const profile = getHumanBotProfile(entrant.id);
  return (
    <Paper withBorder radius="md" px="sm" py={6}>
      <Group gap="sm" wrap="nowrap">
        <Avatar
          size={30}
          radius="xl"
          color={PLAY_COLORS[humanBotPlayStyle(profile)]}
          variant="light"
        >
          {initials(entrant.name)}
        </Avatar>
        <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" fw={600} truncate>
              {entrant.name}
            </Text>
            {entrant.kind === "generated" && (
              <Tooltip
                label={t(
                  "Tournaments.Generated.Desc",
                  "A generated player: no story, but always the same player in every tournament.",
                )}
                multiline
                w={240}
              >
                <Badge size="xs" variant="outline" color="gray">
                  {t("Tournaments.Generated", "Generated")}
                </Badge>
              </Tooltip>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {entrant.rating}
          </Text>
        </Stack>
        <BotBadges profile={profile} />
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t("Tournaments.Field.Remove", "Remove")}
          onClick={onRemove}
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
