import { ActionIcon, Group, Paper, Text, Tooltip } from "@mantine/core";
import { IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { formatTime } from "@/utils/format";

function TimerTile({ label, value, dimmed }: { label: string; value: string; dimmed?: boolean }) {
  return (
    <Paper withBorder p="xs" miw={110} style={{ flex: 1 }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="lg" ff="monospace" c={dimmed ? "dimmed" : undefined}>
        {value}
      </Text>
    </Paper>
  );
}

/** Puzzle-trainer style tiles for the exercise and Woodpecker cycle clocks. */
export default function TacticsTimerBar({
  exerciseMs,
  cycleMs,
  mistakes,
  paused,
  onTogglePause,
}: {
  /** Null hides the tile. */
  exerciseMs: number | null;
  cycleMs: number | null;
  mistakes: number | null;
  paused: boolean;
  onTogglePause: () => void;
}) {
  const { t: trainingT } = useTranslation();
  const hasClock = exerciseMs !== null || cycleMs !== null;

  return (
    <Group gap="xs" wrap="nowrap" align="stretch">
      {exerciseMs !== null && (
        <TimerTile
          label={trainingT("Training.Tactics.Timer.Exercise", "Puzzle time")}
          value={formatTime(exerciseMs)}
          dimmed={paused}
        />
      )}
      {cycleMs !== null && (
        <TimerTile
          label={trainingT("Training.Tactics.Timer.Cycle", "Cycle time")}
          value={formatTime(cycleMs)}
          dimmed={paused}
        />
      )}
      {mistakes !== null && (
        <TimerTile
          label={trainingT("Training.Tactics.Timer.Mistakes", "Mistakes")}
          value={String(mistakes)}
        />
      )}
      {hasClock && (
        <Tooltip
          label={
            paused
              ? trainingT("Training.Tactics.Timer.Resume", "Resume timers")
              : trainingT(
                  "Training.Tactics.Timer.Pause",
                  "Pause timers (they resume when you play or change puzzle)",
                )
          }
        >
          <ActionIcon
            variant={paused ? "filled" : "default"}
            color={paused ? "orange" : undefined}
            size="xl"
            h="auto"
            onClick={onTogglePause}
            aria-label={
              paused
                ? trainingT("Training.Tactics.Timer.Resume", "Resume timers")
                : trainingT(
                    "Training.Tactics.Timer.Pause",
                    "Pause timers (they resume when you play or change puzzle)",
                  )
            }
          >
            {paused ? <IconPlayerPlay size={20} /> : <IconPlayerPause size={20} />}
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
