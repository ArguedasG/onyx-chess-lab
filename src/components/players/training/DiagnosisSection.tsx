import { Badge, Button, Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import {
  IconArrowRight,
  IconClock,
  IconDroplet,
  IconListCheck,
  IconShieldHalf,
  IconSitemap,
  IconStairs,
  IconTrophy,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { diagnose, type Priority } from "@/utils/mistakes/diagnosis";
import type { LeakCategory } from "@/utils/mistakes/leaks";
import type { MistakeFilter } from "@/utils/mistakes/queue";
import type {
  PlayerAnalysisPhase,
  PlayerAnalysisTimeControl,
  PlayerEngineAnalysis,
} from "@/utils/playerAnalysis";
import type { ProfileGame } from "@/utils/players/profileGames";
import { EngineAnalysisButton, EngineBadge, RatingParValue } from "../common";
import { timeControlLabel } from "../labels";
import { EmptyState, SectionHeader } from "../preparation/common";
import { colorName, phaseName } from "../preparation/labels";
import { categoryName } from "./labels";

export type DiagnosisActions = {
  reviewQueue: (filter: MistakeFilter) => void;
  practice: (kind: "conversion" | "defense") => void;
  showLeaks: () => void;
  showOpenings: () => void;
};

/**
 * Training priorities without an LLM (I-18): the player's problems in a fixed, written order,
 * each with its evidence and a concrete action.
 */
export default function DiagnosisSection({
  games,
  engine,
  actions,
}: {
  games: ProfileGame[];
  engine: PlayerEngineAnalysis | null;
  actions: DiagnosisActions;
}) {
  const { t } = useTranslation();
  const diagnosis = useMemo(() => diagnose(games, engine), [engine, games]);

  const describe = (priority: Priority) => {
    switch (priority.kind) {
      case "leak":
        return {
          icon: <IconDroplet size={16} />,
          color: "red",
          engine: true,
          title: t("Diagnosis.Leak", "Costliest leak: {{category}}", {
            category: categoryName(priority.category, t),
          }),
          evidence: t(
            "Diagnosis.LeakEvidence",
            "{{errors}} errors, {{cost}} points of winning chances in {{games}} analyzed games.",
            { errors: priority.errors, cost: Math.round(priority.cost), games: priority.games },
          ),
          action: {
            label: t("Diagnosis.ReviewThese", "Review these errors"),
            run: () => actions.reviewQueue({ category: priority.category as LeakCategory }),
          },
          extra: {
            label: t("Diagnosis.SeeLeaks", "See all leaks"),
            run: actions.showLeaks,
          },
        };
      case "phase":
        return {
          icon: <IconStairs size={16} />,
          color: "orange",
          engine: true,
          title: t("Diagnosis.Phase", "Most errors in the {{phase}}", {
            phase: phaseName(priority.phase, t),
          }),
          evidence: t(
            "Diagnosis.PhaseEvidence",
            "{{rate}} mistakes or blunders per 100 moves against {{average}} on average ({{moves}} moves).",
            {
              rate: priority.rate.toFixed(1),
              average: priority.average.toFixed(1),
              moves: priority.moves,
            },
          ),
          action: {
            label: t("Diagnosis.ReviewPhase", "Review errors of this phase"),
            run: () => actions.reviewQueue({ phase: priority.phase as PlayerAnalysisPhase }),
          },
        };
      case "lowClock":
        return {
          icon: <IconClock size={16} />,
          color: "yellow",
          engine: true,
          title: t("Diagnosis.LowClock", "More errors with little time"),
          evidence: t(
            "Diagnosis.LowClockEvidence",
            "{{low}} errors per 100 moves with less than 10% of the time, against {{rest}} with more ({{moves}} moves with little time).",
            {
              low: ((priority.low.errors / priority.low.moves) * 100).toFixed(1),
              rest: ((priority.rest.errors / priority.rest.moves) * 100).toFixed(1),
              moves: priority.low.moves,
            },
          ),
          action: {
            label: t("Diagnosis.ReviewTime", "Review time-trouble errors"),
            run: () => actions.reviewQueue({ category: "timeTrouble" }),
          },
        };
      case "conversion":
        return {
          icon: <IconTrophy size={16} />,
          color: "teal",
          engine: true,
          title: t("Diagnosis.Conversion", "Advantages that are not converted"),
          evidence: t(
            "Diagnosis.ConversionEvidence",
            "{{rate}}% of {{games}} games with +1.5 or more were won (priority below 70%).",
            { rate: Math.round(priority.rate), games: priority.games },
          ),
          action: {
            label: t("Diagnosis.PracticeConversion", "Practice converting"),
            run: () => actions.practice("conversion"),
          },
        };
      case "defense":
        return {
          icon: <IconShieldHalf size={16} />,
          color: "blue",
          engine: true,
          title: t("Diagnosis.Defense", "Worse positions are rarely saved"),
          evidence: t(
            "Diagnosis.DefenseEvidence",
            "{{rate}}% of {{games}} games at −1.5 or worse were drawn or won (priority below 30%).",
            { rate: Math.round(priority.rate), games: priority.games },
          ),
          action: {
            label: t("Diagnosis.PracticeDefense", "Practice defending"),
            run: () => actions.practice("defense"),
          },
        };
      case "opening":
        return {
          icon: <IconSitemap size={16} />,
          color: "grape",
          engine: false,
          title: t("Diagnosis.Opening", "Weakest opening with {{color}}: {{name}}", {
            color: colorName(priority.color, t).toLowerCase(),
            name: priority.name,
          }),
          evidence: t("Diagnosis.OpeningEvidence", "{{games}} games, score against the expected:", {
            games: priority.bucket.games,
          }),
          par: priority.bucket,
          action: {
            label: t("Diagnosis.CheckRepertoire", "Compare with my repertoire"),
            run: actions.showOpenings,
          },
        };
      case "timeControl":
        return {
          icon: <IconClock size={16} />,
          color: "gray",
          engine: false,
          title: t("Diagnosis.TimeControl", "Weakest time control: {{timeControl}}", {
            timeControl: timeControlLabel(priority.timeControl as PlayerAnalysisTimeControl, t),
          }),
          evidence: t(
            "Diagnosis.TimeControlEvidence",
            "{{games}} games, score against the expected:",
            {
              games: priority.bucket.games,
            },
          ),
          par: priority.bucket,
        };
    }
  };

  return (
    <Stack gap="md">
      <SectionHeader
        icon={<IconListCheck size={18} />}
        title={t("Diagnosis.Title", "Training priorities")}
        description={t(
          "Diagnosis.Description",
          "What to train first, each item with its evidence and a concrete step. The order is fixed: first the costliest leak and the weak phases the engine measured, then conversion and defense, then results without the engine (openings and time controls).",
        )}
      />
      {diagnosis.analyzedGames === 0 && (
        <Paper withBorder radius="md" p="md" style={{ borderStyle: "dashed" }}>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text size="sm" c="dimmed" style={{ flex: 1, minWidth: 240 }}>
              {t(
                "Diagnosis.NoEngine",
                "Without an engine analysis of these games only the results are diagnosed (openings and time controls).",
              )}
            </Text>
            <EngineAnalysisButton />
          </Group>
        </Paper>
      )}
      {diagnosis.priorities.length === 0 ? (
        <EmptyState>
          {t(
            "Diagnosis.Nothing",
            "Nothing stands out with enough sample in these games. Keep reviewing the queue and analyze more games.",
          )}
        </EmptyState>
      ) : (
        diagnosis.priorities.map((priority, index) => {
          const item = describe(priority);
          return (
            <Paper key={`${priority.kind}:${index}`} withBorder radius="md" p="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                  <ThemeIcon variant="light" color={item.color} radius="xl">
                    {item.icon}
                  </ThemeIcon>
                  <Stack gap={4} style={{ minWidth: 0 }}>
                    <Group gap={6}>
                      <Badge size="xs" variant="outline" color="gray">
                        {index + 1}
                      </Badge>
                      <Text fw={700} size="sm">
                        {item.title}
                      </Text>
                      {item.engine && <EngineBadge games={diagnosis.analyzedGames} />}
                    </Group>
                    <Group gap={6}>
                      <Text size="xs" c="dimmed">
                        {item.evidence}
                      </Text>
                      {"par" in item && item.par && <RatingParValue par={item.par} size="xs" />}
                    </Group>
                  </Stack>
                </Group>
                <Stack gap={4} align="flex-end">
                  {"action" in item && item.action && (
                    <Button
                      size="xs"
                      variant="light"
                      rightSection={<IconArrowRight size={14} />}
                      onClick={item.action.run}
                    >
                      {item.action.label}
                    </Button>
                  )}
                  {"extra" in item && item.extra && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={item.extra.run}
                    >
                      {item.extra.label}
                    </Button>
                  )}
                </Stack>
              </Group>
            </Paper>
          );
        })
      )}
      <Text size="xs" c="dimmed">
        {t(
          "Diagnosis.Sample",
          "{{games}} games in the filters, {{analyzed}} analyzed with the engine. Templates over measured facts: no AI writes or decides these items.",
          { games: diagnosis.games, analyzed: diagnosis.analyzedGames },
        )}
      </Text>
    </Stack>
  );
}
