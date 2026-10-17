import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { Sparkline } from "@mantine/charts";
import { IconChartLine, IconRepeat } from "@tabler/icons-react";
import { formatReviewInterval } from "@/components/files/opening";
import { PROVISIONAL_DEVIATION } from "@/utils/tacticsRating";
import {
  dueTacticsReview,
  nextTacticsReviewDate,
  type TacticsReviewState,
} from "@/utils/tacticsReview";

/**
 * Progress of tactics at a glance: the local tactical rating with its trend (I-06) and the
 * spaced review of missed tactics.
 */
export default function TacticsProgressCards({
  state,
  onReview,
  onAutoAddChange,
}: {
  state: TacticsReviewState | null;
  onReview: () => void;
  onAutoAddChange: (value: boolean) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const rating = state?.rating;
  const history = rating?.history ?? [];
  const recent = history.slice(-60);
  const trend = recent.length >= 2 ? recent[recent.length - 1].rating - recent[0].rating : null;
  const provisional = !rating || rating.deviation >= PROVISIONAL_DEVIATION;
  const due = state ? dueTacticsReview(state).length : 0;
  const total = state ? Object.keys(state.items).length : 0;
  const next = state && due === 0 ? nextTacticsReviewDate(state) : null;

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Card withBorder>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Group gap="xs">
              <IconChartLine size={20} color="var(--mantine-color-orange-6)" />
              <Text fw={600}>{trainingT("Tactics.Progress.Rating", "Tactical rating")}</Text>
            </Group>
            <Group gap="xs" align="baseline">
              <Text fz={32} fw={700} lh={1.1}>
                {rating && rating.games > 0 ? rating.rating : "—"}
              </Text>
              {rating && rating.games > 0 && (
                <Text size="sm" c="dimmed">
                  ± {Math.round(rating.deviation)}
                </Text>
              )}
              {trend !== null && trend !== 0 && (
                <Badge variant="light" color={trend > 0 ? "teal" : "red"}>
                  {trend > 0 ? "+" : ""}
                  {trend}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {rating && rating.games > 0
                ? provisional
                  ? trainingT("Tactics.Progress.Provisional", "Provisional · {{count}} puzzles", {
                      count: rating.games,
                    })
                  : trainingT("Tactics.Progress.Games", "{{count}} rated puzzles", {
                      count: rating.games,
                    })
                : trainingT(
                    "Tactics.Progress.NoRating",
                    "Solve puzzles in the trainer (free or countdown) to get one.",
                  )}
            </Text>
          </Stack>
          {recent.length >= 3 && (
            <Sparkline
              w={160}
              h={60}
              data={recent.map((entry) => entry.rating)}
              curveType="monotone"
              color={trend !== null && trend < 0 ? "red" : "teal"}
              fillOpacity={0.2}
              strokeWidth={2}
            />
          )}
        </Group>
      </Card>

      <Card withBorder>
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Group gap="xs">
              <IconRepeat size={20} color="var(--mantine-color-orange-6)" />
              <Text fw={600}>
                {trainingT("Tactics.Progress.Review", "Review of missed tactics")}
              </Text>
            </Group>
            <Text fz={32} fw={700} lh={1.1}>
              {due}
            </Text>
            <Text size="xs" c="dimmed">
              {due > 0
                ? trainingT("Tactics.Progress.Due", "due now · {{total}} in the review", { total })
                : next
                  ? trainingT(
                      "Tactics.Progress.Next",
                      "Next one in {{interval}} · {{total}} in the review",
                      {
                        interval: formatReviewInterval(next),
                        total,
                      },
                    )
                  : trainingT(
                      "Tactics.Progress.Empty",
                      "Missed puzzles and exercises will come back here.",
                    )}
            </Text>
          </Stack>
          <Stack gap="xs" align="flex-end">
            <Button
              color="orange"
              variant={due > 0 ? "filled" : "light"}
              leftSection={<IconRepeat size={16} />}
              disabled={due === 0}
              onClick={onReview}
            >
              {trainingT("Tactics.Progress.Start", "Review")}
            </Button>
            <Tooltip
              label={trainingT(
                "Tactics.Progress.AutoAddTip",
                "Missed puzzles of the trainer and exercises of your sets join the review on their own.",
              )}
              multiline
              w={240}
            >
              <Switch
                size="xs"
                label={trainingT("Tactics.Progress.AutoAdd", "Add misses")}
                checked={state?.autoAdd ?? true}
                onChange={(event) => onAutoAddChange(event.currentTarget.checked)}
              />
            </Tooltip>
          </Stack>
        </Group>
      </Card>
    </SimpleGrid>
  );
}
