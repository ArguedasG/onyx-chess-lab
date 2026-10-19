import {
  Alert,
  Button,
  Chip,
  Collapse,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconAlertTriangle, IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TimeControlField } from "@/utils/clock";
import type { GuidedLevel } from "@/utils/guidedPlay";
import { getHumanBotProfile, isMaiaEngine } from "@/utils/humanBots";
import { BotSummaryCard, useCatalogRepertoireLabel } from "./BotPicker";
import { EnginesSelect } from "./EnginesSelect";
import type { OpponentSettings } from "./OpponentForm";
import { useRhythmLabel } from "./RatedGameSelector";

type BotSettings = Extract<OpponentSettings, { type: "humanBot" }>;
type HumanSettings = Extract<OpponentSettings, { type: "human" }>;
export type UserColor = "white" | "black" | "random";

/** Usual clocks, grouped by rhythm: minutes and increment seconds. */
const CLOCK_PRESETS = [
  {
    rhythm: "blitz",
    clocks: [
      [3, 2],
      [5, 0],
      [5, 3],
    ],
  },
  {
    rhythm: "rapid",
    clocks: [
      [10, 0],
      [10, 5],
      [15, 10],
    ],
  },
  {
    rhythm: "classical",
    clocks: [
      [30, 0],
      [30, 20],
    ],
  },
] as const;

function clockKey(clock: TimeControlField | undefined): string {
  return clock ? `${clock.seconds / 60_000}+${(clock.increment ?? 0) / 1000}` : "none";
}

function isPreset(key: string): boolean {
  return (
    key === "none" ||
    CLOCK_PRESETS.some((group) => group.clocks.some(([m, i]) => `${m}+${i}` === key))
  );
}

/** The clock of a game against a bot: presets by rhythm, no clock or a custom one. */
export function ClockPresets({
  clock,
  onChange,
  compact = false,
}: {
  clock: TimeControlField | undefined;
  onChange: (clock: TimeControlField | undefined) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const rhythmLabel = useRhythmLabel();
  const current = clockKey(clock);
  const [customOpened, setCustomOpened] = useState(!isPreset(current));
  const custom = customOpened || !isPreset(current);

  const select = (key: string) => {
    if (key === "custom") {
      setCustomOpened(true);
      return;
    }
    setCustomOpened(false);
    if (key === "none") return onChange(undefined);
    const [minutes, increment] = key.split("+").map(Number);
    onChange({ seconds: minutes * 60_000, increment: increment * 1000 });
  };

  return (
    <Stack gap={compact ? 4 : 6}>
      <Chip.Group value={custom ? "custom" : current} onChange={(value) => select(value as string)}>
        {CLOCK_PRESETS.map((group) => (
          <Group key={group.rhythm} gap={6} wrap="nowrap">
            <Text size="xs" c="dimmed" w={64}>
              {rhythmLabel(group.rhythm)}
            </Text>
            <Group gap={4}>
              {group.clocks.map(([minutes, increment]) => (
                <Chip key={`${minutes}+${increment}`} value={`${minutes}+${increment}`} size="xs">
                  {minutes}+{increment}
                </Chip>
              ))}
            </Group>
          </Group>
        ))}
        <Group gap={6} wrap="nowrap">
          <Text size="xs" c="dimmed" w={64}>
            {t("HumanBots.Clock.Other", "Other")}
          </Text>
          <Group gap={4}>
            <Chip value="none" size="xs">
              {t("HumanBots.Clock.None", "No clock")}
            </Chip>
            <Chip value="custom" size="xs">
              {t("HumanBots.Clock.Custom", "Custom")}
            </Chip>
          </Group>
        </Group>
      </Chip.Group>
      {custom && (
        <Group gap="xs" grow>
          <NumberInput
            size="xs"
            label={t("HumanBots.Clock.Minutes", "Minutes")}
            min={0.25}
            max={180}
            step={1}
            decimalScale={2}
            value={(clock?.seconds ?? 600_000) / 60_000}
            onChange={(value) =>
              typeof value === "number" &&
              value > 0 &&
              onChange({ seconds: Math.round(value * 60_000), increment: clock?.increment ?? 0 })
            }
          />
          <NumberInput
            size="xs"
            label={t("HumanBots.Clock.Increment", "Increment (s)")}
            min={0}
            max={180}
            step={1}
            value={(clock?.increment ?? 0) / 1000}
            onChange={(value) =>
              typeof value === "number" &&
              value >= 0 &&
              onChange({ seconds: clock?.seconds ?? 600_000, increment: Math.round(value * 1000) })
            }
          />
        </Group>
      )}
    </Stack>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap={6}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

/**
 * Setup of a game against a catalog bot (Phase 9.1): the bot, the clock, the game type and the
 * color in one panel, in that order. Everything else stays under advanced options.
 */
export default function BotGameSetup({
  bot,
  setBot,
  player,
  setPlayer,
  userColor,
  setUserColor,
  setClock,
  guidedLevel,
  setGuidedLevel,
  ratedSelector,
  advanced,
  humanTimingEnabled,
  onManualSetup,
}: {
  bot: BotSettings;
  setBot: (update: (previous: OpponentSettings) => OpponentSettings) => void;
  player: HumanSettings;
  setPlayer: (update: (previous: OpponentSettings) => OpponentSettings) => void;
  userColor: UserColor;
  setUserColor: (color: UserColor) => void;
  setClock: (clock: TimeControlField | undefined) => void;
  guidedLevel: GuidedLevel;
  setGuidedLevel: (level: GuidedLevel) => void;
  ratedSelector: ReactNode;
  advanced?: ReactNode;
  humanTimingEnabled: boolean;
  onManualSetup: () => void;
}) {
  const { t } = useTranslation();
  const repertoireLabel = useCatalogRepertoireLabel();
  const [advancedOpened, setAdvancedOpened] = useState(false);
  const profile = getHumanBotProfile(bot.profileId);
  const maia = bot.engine && isMaiaEngine(bot.engine) ? bot.engine : null;
  const clockSelector = <ClockPresets clock={bot.timeControl} onChange={setClock} compact />;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={700} size="lg">
            {t("HumanBots.Setup.Title", "Game against a bot")}
          </Text>
          <Button size="compact-xs" variant="subtle" color="gray" onClick={onManualSetup}>
            {t("HumanBots.Setup.Manual", "Set up players manually")}
          </Button>
        </Group>

        {!maia && (
          <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
            {t(
              "HumanBots.NoMaiaEngine",
              "No Maia 3 engine was found. Add it from the Engines section first.",
            )}
          </Alert>
        )}

        <Section label={t("HumanBots.Setup.Opponent", "Opponent")}>
          <BotSummaryCard
            profile={profile}
            clock={bot.timeControl}
            repertoireLabel={repertoireLabel(profile)}
            clockSelector={clockSelector}
            onChange={(profileId) =>
              setBot((previous) =>
                previous.type === "humanBot"
                  ? { ...previous, profileId, twin: undefined }
                  : previous,
              )
            }
          />
        </Section>

        <Section label={t("HumanBots.Setup.Clock", "Time control")}>
          <ClockPresets clock={bot.timeControl} onChange={setClock} />
        </Section>

        <Section label={t("HumanBots.Guided.Section", "Help")}>
          <SegmentedControl
            fullWidth
            value={guidedLevel}
            onChange={(value) => setGuidedLevel(value as GuidedLevel)}
            data={[
              { value: "off", label: t("HumanBots.Guided.Off", "No help") },
              { value: "warnings", label: t("HumanBots.Guided.Warnings", "Warnings") },
              { value: "hints", label: t("HumanBots.Guided.Hints", "Warnings and hints") },
            ]}
          />
          {guidedLevel !== "off" && (
            <Text size="xs" c="dimmed">
              {guidedLevel === "warnings"
                ? t(
                    "HumanBots.Guided.Warnings.Desc",
                    "You are warned when one move is clearly better than the others.",
                  )
                : t(
                    "HumanBots.Guided.Hints.Desc",
                    "You are warned at critical moments and can ask for the piece to move, then the move.",
                  )}
            </Text>
          )}
        </Section>

        <Section label={t("HumanBots.Rated.Title", "Game type")}>{ratedSelector}</Section>

        <Section label={t("HumanBots.Setup.Color", "You play")}>
          <SegmentedControl
            fullWidth
            value={userColor}
            onChange={(value) => setUserColor(value as UserColor)}
            data={[
              { value: "white", label: t("Common.WHITE", "White") },
              { value: "random", label: t("HumanBots.Setup.Random", "Random") },
              { value: "black", label: t("Common.BLACK", "Black") },
            ]}
          />
        </Section>

        <Stack gap="xs">
          <UnstyledButton onClick={() => setAdvancedOpened((opened) => !opened)}>
            <Group gap={4}>
              {advancedOpened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <Text size="sm" c="dimmed">
                {t("HumanBots.Setup.Advanced", "Advanced options")}
              </Text>
            </Group>
          </UnstyledButton>
          <Collapse in={advancedOpened}>
            <Stack gap="sm">
              <TextInput
                size="xs"
                label={t("HumanBots.Setup.YourName", "Your name")}
                value={player.name ?? ""}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setPlayer((previous) => ({ ...previous, name }));
                }}
              />
              {humanTimingEnabled && (
                <Switch
                  checked={bot.humanTiming ?? true}
                  label={t("HumanBots.Timing", "Human thinking time")}
                  description={t(
                    "HumanBots.Timing.Desc",
                    "Adds variable, clock-aware pauses and records the observed decision time.",
                  )}
                  onChange={(event) => {
                    const humanTiming = event.currentTarget.checked;
                    setBot((previous) =>
                      previous.type === "humanBot" ? { ...previous, humanTiming } : previous,
                    );
                  }}
                />
              )}
              <EnginesSelect
                engine={maia}
                filter={isMaiaEngine}
                label={t("HumanBots.MaiaEngine", "Maia 3 engine")}
                description={t(
                  "HumanBots.MaiaEngine.Desc",
                  "Local Maia 3 installation used by this profile.",
                )}
                setEngine={(engine) =>
                  setBot((previous) =>
                    previous.type === "humanBot" ? { ...previous, engine } : previous,
                  )
                }
              />
              {advanced}
            </Stack>
          </Collapse>
        </Stack>
      </Stack>
    </Paper>
  );
}
