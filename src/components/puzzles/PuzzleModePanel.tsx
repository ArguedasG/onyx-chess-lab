import {
  Alert,
  Badge,
  Button,
  Group,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconBolt,
  IconFlame,
  IconHeart,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrophy,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { formatTime } from "@/utils/format";
import { type PuzzleMode, type RushSettings, type RushState } from "@/utils/puzzleSession";

/**
 * Session modes of the puzzle trainer (I-05): free, storm (global clock, rising difficulty, a
 * mistake costs time), streak (lives, rising difficulty) and countdown (the same time for every
 * puzzle).
 */
export default function PuzzleModePanel({
  mode,
  onModeChange,
  settings,
  onSettingsChange,
  rush,
  stormLeftMs,
  countdownLeftMs,
  best,
  newBest,
  disabled,
  onStart,
  onStop,
}: {
  mode: PuzzleMode;
  onModeChange: (mode: PuzzleMode) => void;
  settings: RushSettings;
  onSettingsChange: (settings: RushSettings) => void;
  rush: RushState | null;
  stormLeftMs: number | null;
  countdownLeftMs: number | null;
  best: { storm?: number; streak?: number };
  /** The finished storm or streak beat the previous best. */
  newBest: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const running = rush?.status === "running";
  const over = rush?.status === "over";

  return (
    <Stack gap="xs">
      <SegmentedControl
        fullWidth
        size="xs"
        value={mode}
        disabled={running}
        onChange={(value) => onModeChange(value as PuzzleMode)}
        data={[
          { value: "free", label: t("Puzzle.Mode.Free", "Free") },
          { value: "storm", label: t("Puzzle.Mode.Storm", "Storm") },
          { value: "streak", label: t("Puzzle.Mode.Streak", "Streak") },
          { value: "countdown", label: t("Puzzle.Mode.Countdown", "Countdown") },
        ]}
      />

      {mode === "free" && (
        <Text size="xs" c="dimmed">
          {t(
            "Puzzle.Mode.FreeDesc",
            "At your own pace. The first try of each puzzle counts for your tactical rating.",
          )}
        </Text>
      )}

      {mode === "countdown" && (
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="xs" c="dimmed">
            {t(
              "Puzzle.Mode.CountdownDesc",
              "The same time for every puzzle; running out counts as a miss.",
            )}
          </Text>
          <Select
            size="xs"
            w={100}
            allowDeselect={false}
            value={String(settings.countdownSeconds)}
            onChange={(value) =>
              value && onSettingsChange({ ...settings, countdownSeconds: Number(value) })
            }
            data={[15, 30, 60, 120].map((seconds) => ({
              value: String(seconds),
              label: `${seconds} s`,
            }))}
            aria-label={t("Puzzle.Mode.TimePerPuzzle", "Time per puzzle")}
          />
        </Group>
      )}
      {mode === "countdown" && countdownLeftMs !== null && (
        <Progress
          size="sm"
          value={(countdownLeftMs / (settings.countdownSeconds * 1000)) * 100}
          color={countdownLeftMs < 5000 ? "red" : "blue"}
        />
      )}

      {(mode === "storm" || mode === "streak") && !running && !over && (
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="xs" c="dimmed" style={{ flex: 1 }}>
            {mode === "storm"
              ? t(
                  "Puzzle.Mode.StormDesc",
                  "Solve as many as you can before the clock ends. Each one is harder; a mistake costs 10 s.",
                )
              : t(
                  "Puzzle.Mode.StreakDesc",
                  "Each puzzle is harder than the last. A mistake costs a life.",
                )}
          </Text>
          {mode === "storm" ? (
            <Select
              size="xs"
              w={90}
              allowDeselect={false}
              value={String(settings.stormSeconds)}
              onChange={(value) =>
                value && onSettingsChange({ ...settings, stormSeconds: Number(value) })
              }
              data={[
                { value: "180", label: "3 min" },
                { value: "300", label: "5 min" },
              ]}
              aria-label={t("Puzzle.Mode.Duration", "Duration")}
            />
          ) : (
            <Select
              size="xs"
              w={100}
              allowDeselect={false}
              value={String(settings.streakLives)}
              onChange={(value) =>
                value && onSettingsChange({ ...settings, streakLives: Number(value) })
              }
              data={[1, 2, 3].map((lives) => ({
                value: String(lives),
                label: t("Puzzle.Mode.Lives", "{{count}} lives", { count: lives }),
              }))}
              aria-label={t("Puzzle.Mode.LivesLabel", "Lives")}
            />
          )}
          <Button
            size="xs"
            leftSection={<IconPlayerPlay size={14} />}
            disabled={disabled}
            onClick={onStart}
          >
            {t("Puzzle.Mode.Start", "Start")}
          </Button>
        </Group>
      )}

      {(mode === "storm" || mode === "streak") && !running && !over && best[mode] !== undefined && (
        <Text size="xs" c="dimmed">
          {t("Puzzle.Mode.Best", "Your best: {{score}}", { score: best[mode] })}
        </Text>
      )}

      {running && rush && (
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            {rush.mode === "storm" ? (
              <Badge
                size="lg"
                variant="filled"
                color={stormLeftMs !== null && stormLeftMs < 20_000 ? "red" : "blue"}
                leftSection={<IconBolt size={14} />}
              >
                {formatTime(stormLeftMs ?? 0)}
              </Badge>
            ) : (
              <Badge size="lg" variant="light" color="red" leftSection={<IconHeart size={14} />}>
                {rush.lives}
              </Badge>
            )}
            <Badge variant="light" color="teal">
              {t("Puzzle.Mode.Solved", "{{count}} solved", { count: rush.solved })}
            </Badge>
            <Badge variant="light" color="orange" leftSection={<IconFlame size={12} />}>
              {rush.combo}
            </Badge>
          </Group>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconPlayerStop size={14} />}
            onClick={onStop}
          >
            {t("Puzzle.Mode.Stop", "Stop")}
          </Button>
        </Group>
      )}

      {over && rush && (
        <Alert color="teal" variant="light" icon={<IconTrophy size={18} />} p="sm">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              {rush.mode === "storm"
                ? t("Puzzle.Mode.StormOver", "Storm over: {{count}} solved", { count: rush.solved })
                : t("Puzzle.Mode.StreakOver", "Streak over: {{count}} in a row", {
                    count: rush.bestCombo,
                  })}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "Puzzle.Mode.Summary",
                "Best combo {{combo}} · hardest solved {{rating}} · {{failed}} misses",
                {
                  combo: rush.bestCombo,
                  rating: rush.highestSolved ?? "–",
                  failed: rush.failed,
                },
              )}
            </Text>
            {newBest && (
              <Text size="xs" c="teal" fw={600}>
                {t("Puzzle.Mode.NewBest", "New best result")}
              </Text>
            )}
            <Group gap="xs" mt={4}>
              <Button
                size="xs"
                leftSection={<IconPlayerPlay size={14} />}
                onClick={onStart}
                disabled={disabled}
              >
                {t("Puzzle.Mode.Again", "Again")}
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={onStop}>
                {t("Puzzle.Mode.Close", "Close")}
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
