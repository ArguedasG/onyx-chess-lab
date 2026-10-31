import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Progress,
  SimpleGrid,
  Slider,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAdjustments,
  IconPlayerStop,
  IconRefresh,
  IconScale,
  IconSparkles,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { usePersonalityLabels } from "@/components/boards/BotPicker";
import type { BotPlayStyleId } from "@/utils/botCatalogSpecs";
import type { LocalEngine } from "@/utils/engines";
import { MAIA_ELO_MAX, MAIA_ELO_MIN } from "@/utils/humanBots";
import type { ProfileGame } from "@/utils/players/profileGames";
import {
  clampTwinElo,
  neutralPlay,
  PERSONALITY_WEIGHTS,
  type TwinEvaluation,
  type TwinOrigin,
  type TwinPlay,
  type TwinProfile,
  withEvaluation,
} from "@/utils/preparation/savedTwins";
import { TWIN_ELO_MAX } from "@/utils/preparation/twin";
import {
  FIT_MIN_GAMES,
  fitPasses,
  runTwinFit,
  type TwinFitKind,
} from "@/utils/preparation/twinFit";

type Run =
  | { status: "idle" }
  | { status: "running"; kind: TwinFitKind; progress: number }
  | { status: "error"; message: string };

function signedWeight(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}`;
}

/** Geometric mean of the probability of the move played, the twin against Maia alone. */
function gainOf(evaluation: TwinEvaluation) {
  return (Math.exp(evaluation.twin.logLikelihood - evaluation.maia.logLikelihood) - 1) * 100;
}

export function OriginBadge({ origin }: { origin: TwinOrigin }) {
  const { t } = useTranslation();
  const labels: Record<TwinOrigin, { label: string; color: string; hint: string }> = {
    default: {
      label: t("Preparation.Twin.Origin.Default", "Maia at their rating"),
      color: "gray",
      hint: t(
        "Preparation.Twin.Origin.DefaultHint",
        "Out of the book it plays as Maia at the player's rating, without a style of its own.",
      ),
    },
    measured: {
      label: t("Preparation.Twin.Origin.Measured", "Measured style"),
      color: "grape",
      hint: t(
        "Preparation.Twin.Origin.MeasuredHint",
        "Style weights fitted on the player's older games that predict the recent ones better than Maia.",
      ),
    },
    fitted: {
      label: t("Preparation.Twin.Origin.Fitted", "Autotuned"),
      color: "teal",
      hint: t(
        "Preparation.Twin.Origin.FittedHint",
        "Rating, style and variability fitted on the player's older games; they predict the recent ones better than Maia.",
      ),
    },
    manual: {
      label: t("Preparation.Twin.Origin.Manual", "Adjusted by hand, not measured"),
      color: "orange",
      hint: t(
        "Preparation.Twin.Origin.ManualHint",
        "Changed by hand: nothing says it resembles the player more. «Evaluate» compares it with Maia on their games.",
      ),
    },
  };
  const entry = labels[origin];
  return (
    <Tooltip label={entry.hint} multiline maw={320}>
      <Badge variant="light" color={entry.color} style={{ textTransform: "none" }}>
        {entry.label}
      </Badge>
    </Tooltip>
  );
}

/**
 * One profile of a twin (a rhythm or every game): how it plays out of the book, edited by hand
 * or measured on the player's games, and the evaluations that say whether it resembles the player
 * more than Maia alone.
 */
export default function TwinProfileEditor({
  profile,
  games,
  name,
  maia,
  onChange,
}: {
  profile: TwinProfile;
  /** The player's games of this profile. */
  games: ProfileGame[];
  name: string;
  maia: LocalEngine | null;
  onChange: (profile: TwinProfile) => void;
}) {
  const { t } = useTranslation();
  const personalities = usePersonalityLabels().play;
  const [run, setRun] = useState<Run>({ status: "idle" });
  const runId = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (runId.current) void commands.cancelAnalysis(runId.current);
    },
    [],
  );
  // The editor follows the profile shown; a run of another one is cancelled.
  useEffect(() => {
    setRun({ status: "idle" });
    return () => {
      if (runId.current) void commands.cancelAnalysis(runId.current);
    };
  }, [profile.key]);

  const play = profile.play;
  const setPlay = (change: Partial<TwinPlay>) =>
    onChange({ ...profile, play: { ...play, ...change }, origin: "manual" });

  async function measure(kind: TwinFitKind) {
    if (!maia) return;
    const id = `twin-fit-${profile.key}-${Date.now()}`;
    runId.current = id;
    setRun({ status: "running", kind, progress: 0 });
    try {
      const evaluation = await runTwinFit({
        id,
        kind,
        games,
        play,
        rating: profile.rating,
        maia,
        onProgress: (progress) => setRun({ status: "running", kind, progress }),
      });
      if (evaluation) {
        const next = withEvaluation(profile, evaluation);
        // A fitted way of playing is used only if it predicts the recent games better.
        const adopt = kind !== "fixed" && evaluation.improves;
        onChange(
          adopt
            ? {
                ...next,
                play: evaluation.play,
                origin: kind === "autotune" ? "fitted" : "measured",
              }
            : next,
        );
      }
      setRun({ status: "idle" });
    } catch (error) {
      setRun({ status: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      runId.current = null;
    }
  }

  const latest = profile.evaluations[0];
  const enough = games.length >= FIT_MIN_GAMES;
  const minutes = (kind: TwinFitKind) => {
    const passes = fitPasses(kind, play, profile.rating);
    return `${passes}–${passes * 2} min`;
  };

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="xs">
              <IconAdjustments size={16} />
              <Text fw={700}>{t("Preparation.Twin.OutOfBook", "Out of the book")}</Text>
              <OriginBadge origin={profile.origin} />
            </Group>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconRefresh size={14} />}
              disabled={profile.origin === "default"}
              onClick={() =>
                onChange({
                  ...profile,
                  play: neutralPlay(clampTwinElo(profile.rating ?? play.elo)),
                  origin: "default",
                })
              }
            >
              {t("Preparation.Twin.Reset", "Back to Maia at their rating")}
            </Button>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing="sm">
            <NumberInput
              label={t("Preparation.Twin.Elo", "Rating out of the book")}
              description={
                profile.rating
                  ? t("Preparation.Twin.LatestRating", "Latest rating at this rhythm: {{rating}}", {
                      rating: profile.rating,
                    })
                  : t("Preparation.Twin.NoRating", "These games have no rating")
              }
              min={MAIA_ELO_MIN}
              max={TWIN_ELO_MAX}
              step={50}
              value={play.elo}
              onChange={(value) =>
                typeof value === "number" && setPlay({ elo: clampTwinElo(value) })
              }
            />
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                {t("Preparation.Twin.Variability", "Variability")}
              </Text>
              <Text size="xs" c="dimmed">
                {t(
                  "Preparation.Twin.VariabilityHint",
                  "Below 1 it repeats its most likely moves more; above 1 it spreads its choices, and its mistakes, more.",
                )}
              </Text>
              <Slider
                min={0.5}
                max={1.5}
                step={0.05}
                value={play.temperature}
                label={(value) => value.toFixed(2)}
                marks={[{ value: 0.5 }, { value: 1, label: "1" }, { value: 1.5 }]}
                onChange={(value) => setPlay({ temperature: value })}
              />
            </Stack>
            {(
              [
                [
                  "aggression",
                  t("Preparation.Twin.Aggression", "Aggression"),
                  t("Preparation.Twin.Defensive", "Defensive"),
                  t("Preparation.Twin.Aggressive", "Aggressive"),
                ],
                [
                  "simplification",
                  t("Preparation.Twin.Simplification", "Simplification"),
                  t("Preparation.Twin.Complicates", "Keeps tension"),
                  t("Preparation.Twin.Simplifies", "Simplifies"),
                ],
              ] as const
            ).map(([axis, label, low, high]) => (
              <Stack key={axis} gap={4}>
                <Group justify="space-between">
                  <Text size="sm" fw={500}>
                    {label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {signedWeight(play[axis])}
                  </Text>
                </Group>
                <Slider
                  min={-1}
                  max={1}
                  step={0.05}
                  value={play[axis]}
                  label={(value) => signedWeight(value)}
                  marks={[{ value: -1 }, { value: 0 }, { value: 1 }]}
                  onChange={(value) => setPlay({ [axis]: value })}
                />
                {/* Under the slider, not as marks: a mark's label is centred on the end and
                    spills out of the slider into the next column. */}
                <Group justify="space-between" wrap="nowrap" gap="xs" mt={4}>
                  <Text size="xs" c="dimmed">
                    {low}
                  </Text>
                  <Text size="xs" c="dimmed" ta="right">
                    {high}
                  </Text>
                </Group>
              </Stack>
            ))}
          </SimpleGrid>
          <Group gap={6} wrap="wrap">
            <Text size="xs" c="dimmed">
              {t("Preparation.Twin.StartFrom", "Start from a personality:")}
            </Text>
            {(Object.keys(PERSONALITY_WEIGHTS) as BotPlayStyleId[]).map((id) => (
              <Tooltip key={id} label={personalities[id].description} multiline maw={260}>
                <Button
                  size="compact-xs"
                  variant="default"
                  onClick={() => setPlay({ ...PERSONALITY_WEIGHTS[id] })}
                >
                  {personalities[id].name}
                </Button>
              </Tooltip>
            ))}
          </Group>
          {play.elo > MAIA_ELO_MAX && (
            <Text size="xs" c="dimmed">
              {t(
                "Preparation.Twin.AboveMaia",
                "Above {{max}} Maia plays at {{max}} and Stockfish checks its moves, as with the strongest catalogue bots; the rating is not fitted there.",
                { max: MAIA_ELO_MAX },
              )}
            </Text>
          )}
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Stack gap="sm">
          <Group gap="xs">
            <IconScale size={16} />
            <Text fw={700}>{t("Preparation.Twin.Measure", "Measure against their games")}</Text>
          </Group>
          <Text size="xs" c="dimmed">
            {t(
              "Preparation.Twin.MeasureHint",
              "In {{name}}'s moves after the opening, how likely the twin is to play the real move compared with Maia alone at their rating. Measuring and autotuning fit on the older games and check on the most recent ones, which are left out; their result is used only if it predicts those games better. Evaluating checks the current settings, as they are, on every game.",
              { name },
            )}
          </Text>
          {!enough && (
            <Text size="xs" c="dimmed">
              {t("Preparation.Twin.ProfileFewGames", "It needs at least {{count}} games.", {
                count: FIT_MIN_GAMES,
              })}
            </Text>
          )}
          {run.status === "running" ? (
            <Group gap="sm" wrap="nowrap">
              <Progress value={run.progress} animated striped style={{ flex: 1 }} />
              <Button
                size="xs"
                variant="default"
                leftSection={<IconPlayerStop size={14} />}
                onClick={() => runId.current && void commands.cancelAnalysis(runId.current)}
              >
                {t("Preparation.Twin.Stop", "Stop")}
              </Button>
            </Group>
          ) : (
            <Group gap="xs" wrap="wrap">
              <Tooltip
                label={t(
                  "Preparation.Twin.MeasureStyleHint",
                  "The two style weights at the current rating. About {{time}}.",
                  { time: minutes("style") },
                )}
              >
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconScale size={14} />}
                  disabled={!maia || !enough}
                  onClick={() => void measure("style")}
                >
                  {t("Preparation.Twin.MeasureStyle", "Measure the style")}
                </Button>
              </Tooltip>
              <Tooltip
                label={t(
                  "Preparation.Twin.AutotuneHint",
                  "Style, variability and Maia's rating up to ±200 around the current one. About {{time}}.",
                  { time: minutes("autotune") },
                )}
              >
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconSparkles size={14} />}
                  disabled={!maia || !enough}
                  onClick={() => void measure("autotune")}
                >
                  {t("Preparation.Twin.Autotune", "Autotune")}
                </Button>
              </Tooltip>
              <Tooltip
                label={t(
                  "Preparation.Twin.EvaluateHint",
                  "The current settings against Maia alone at their rating, on every game. About {{time}}.",
                  { time: minutes("fixed") },
                )}
              >
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconTargetArrow size={14} />}
                  disabled={!maia || !enough}
                  onClick={() => void measure("fixed")}
                >
                  {t("Preparation.Twin.Evaluate", "Evaluate these settings")}
                </Button>
              </Tooltip>
            </Group>
          )}
          {run.status === "error" && <Alert color="red">{run.message}</Alert>}
          {latest && <EvaluationView evaluation={latest} name={name} />}
          {profile.evaluations.length > 1 && (
            <EvaluationHistory evaluations={profile.evaluations.slice(1)} />
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

function useKindLabel() {
  const { t } = useTranslation();
  return (kind: TwinFitKind) =>
    kind === "style"
      ? t("Preparation.Twin.Kind.Style", "Style")
      : kind === "autotune"
        ? t("Preparation.Twin.Kind.Autotune", "Autotune")
        : t("Preparation.Twin.Kind.Fixed", "Evaluation");
}

function axisVerdict(
  deviation: { delta: number; stdError: number },
  labels: { more: string; less: string; same: string },
) {
  // Two standard errors: a clear difference with this sample.
  if (Math.abs(deviation.delta) < 2 * deviation.stdError) return labels.same;
  return deviation.delta > 0 ? labels.more : labels.less;
}

function EvaluationView({ evaluation, name }: { evaluation: TwinEvaluation; name: string }) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  const gain = gainOf(evaluation);
  const fitted = evaluation.kind !== "fixed";
  return (
    <Stack gap="xs">
      <Group gap="xs" wrap="wrap">
        <Badge variant="outline" color="gray" style={{ textTransform: "none" }}>
          {`${kindLabel(evaluation.kind)} · ${evaluation.at.slice(0, 10)}`}
        </Badge>
        <Badge
          variant="light"
          color={evaluation.improves ? "teal" : "gray"}
          style={{ textTransform: "none" }}
        >
          {evaluation.improves
            ? t("Preparation.Twin.Improves", "Resembles {{name}} more than Maia", { name })
            : fitted
              ? t("Preparation.Twin.MaiaWins", "Maia alone predicts as well or better: not used")
              : t("Preparation.Twin.NoBetter", "No better than Maia alone")}
        </Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Table withTableBorder verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th ta="right">{t("Preparation.Twin.Top", "First choice")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td fw={600}>
                {fitted
                  ? t("Preparation.Twin.ResultRow", "Result")
                  : t("Preparation.Twin.TwinRow", "Twin")}
              </Table.Td>
              <Table.Td ta="right">{`${(evaluation.twin.top * 100).toFixed(0)}%`}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>
                {t("Preparation.Twin.MaiaRow", "Maia {{elo}}", { elo: evaluation.maiaElo })}
              </Table.Td>
              <Table.Td ta="right">{`${(evaluation.maia.top * 100).toFixed(0)}%`}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        <Stack gap={4}>
          <Text size="sm">
            {gain >= 0
              ? t(
                  "Preparation.Twin.Gain",
                  "The real move is on average {{gain}}% more likely than with Maia alone.",
                  { gain: gain.toFixed(1) },
                )
              : t(
                  "Preparation.Twin.Loss",
                  "The real move is on average {{gain}}% less likely than with Maia alone.",
                  { gain: Math.abs(gain).toFixed(1) },
                )}
          </Text>
          {fitted && (
            <Text size="xs">
              {t(
                "Preparation.Twin.FittedPlay",
                "Fitted: rating {{elo}}, aggression {{aggression}}, simplification {{simplification}}, variability {{temperature}}.",
                {
                  elo: evaluation.play.elo,
                  aggression: signedWeight(evaluation.play.aggression),
                  simplification: signedWeight(evaluation.play.simplification),
                  temperature: evaluation.play.temperature.toFixed(2),
                },
              )}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {fitted
              ? t(
                  "Preparation.Twin.FitSample",
                  "Checked on {{positions}} positions of the most recent games, left out of the fit.",
                  { positions: evaluation.positions },
                )
              : t("Preparation.Twin.FixedSample", "Checked on {{positions}} positions.", {
                  positions: evaluation.positions,
                })}
          </Text>
        </Stack>
      </SimpleGrid>
      {evaluation.aggression && evaluation.simplification && (
        <Group gap="xs" wrap="wrap">
          {(
            [
              [
                t("Preparation.Twin.Aggression", "Aggression"),
                axisVerdict(evaluation.aggression, {
                  more: t("Preparation.Twin.MoreAggressive", "more aggressive than expected"),
                  less: t("Preparation.Twin.LessAggressive", "more defensive than expected"),
                  same: t("Preparation.Twin.AsExpected", "as expected"),
                }),
                evaluation.aggression,
              ],
              [
                t("Preparation.Twin.Simplification", "Simplification"),
                axisVerdict(evaluation.simplification, {
                  more: t("Preparation.Twin.MoreSimplifying", "simplifies more than expected"),
                  less: t("Preparation.Twin.MoreComplicating", "keeps more tension than expected"),
                  same: t("Preparation.Twin.AsExpected", "as expected"),
                }),
                evaluation.simplification,
              ],
            ] as const
          ).map(([label, verdict, deviation]) => (
            <Tooltip
              key={label}
              label={`${signedWeight(deviation.delta)} ± ${deviation.stdError.toFixed(2)}`}
            >
              <Badge
                variant="light"
                color={Math.abs(deviation.delta) < 2 * deviation.stdError ? "gray" : "grape"}
                style={{ textTransform: "none" }}
              >
                {`${label}: ${verdict}`}
              </Badge>
            </Tooltip>
          ))}
        </Group>
      )}
      {evaluation.eloFits.length > 1 && (
        <Text size="xs" c="dimmed">
          {t("Preparation.Twin.EloFits", "Maia alone, first choice by rating: {{list}}.", {
            list: [...evaluation.eloFits]
              .sort((a, b) => a.elo - b.elo)
              .map((entry) => `${entry.elo} ${(entry.fit.top * 100).toFixed(0)}%`)
              .join(" · "),
          })}
        </Text>
      )}
    </Stack>
  );
}

function EvaluationHistory({ evaluations }: { evaluations: TwinEvaluation[] }) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600} c="dimmed">
        {t("Preparation.Twin.History", "Earlier measurements")}
      </Text>
      {evaluations.map((evaluation) => {
        const gain = gainOf(evaluation);
        return (
          <Text key={evaluation.at} size="xs" c="dimmed">
            {`${evaluation.at.slice(0, 10)} · ${kindLabel(evaluation.kind)} · ${evaluation.play.elo} · ${
              gain >= 0 ? "+" : "−"
            }${Math.abs(gain).toFixed(1)}% · ${(evaluation.twin.top * 100).toFixed(0)}% / ${(
              evaluation.maia.top * 100
            ).toFixed(0)}%`}
          </Text>
        );
      })}
    </Stack>
  );
}
