import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  MultiSelect,
  NumberInput,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { LocalEngine } from "@/utils/engines";
import type {
  PlayerAnalysisCriticalPosition,
  PlayerAnalysisReference,
  PlayerAnalysisTimeControl,
  PlayerEngineAnalysis,
} from "@/utils/playerAnalysis";
import type { TrainingAreasState } from "@/utils/trainingAreas";
import {
  classificationLabel,
  formatCp,
  formatScore,
  phaseLabel,
  timeControlLabel,
} from "../labels";
import { Metric } from "./AnalysisSummarySection";
import PlayerVerifiableInsights from "./PlayerVerifiableInsights";

export type EngineControls = {
  engineId: string;
  setEngineId: (value: string) => void;
  localEngines: LocalEngine[];
  engineGames: number;
  setEngineGames: (value: number) => void;
  analyzeAllGames: boolean;
  setAnalyzeAllGames: (value: boolean) => void;
  engineTimeMs: number;
  setEngineTimeMs: (value: number) => void;
  engineTimeControls: PlayerAnalysisTimeControl[];
  setEngineTimeControls: (values: PlayerAnalysisTimeControl[]) => void;
  engineTimeControlCounts: Array<{ value: PlayerAnalysisTimeControl; count: number }>;
  eligibleGames: number;
  /** Games chosen in the Games tab; when set they replace the "most recent games" choice. */
  explicitGames: number | null;
  clearExplicitGames: () => void;
  loadedGames: number;
  sampleSize: number;
  engineLoading: boolean;
  engineProgress: number;
  /** Games of the running analysis: done (analyzed or reused), total and skipped. */
  engineCount: { done: number; total: number; skipped: number };
  run: () => void;
  cancel: () => void;
};

export default function AnalysisEngineSection({
  controls,
  engine,
  training,
  onOpen,
  tacticsSets,
  selectedSetId,
  setSelectedSetId,
  onAddCritical,
  onAddToMistakes,
}: {
  controls: EngineControls;
  engine: PlayerEngineAnalysis | null;
  training: TrainingAreasState;
  onOpen: (reference: PlayerAnalysisReference) => void;
  tacticsSets: Array<{ id: string; name: string }>;
  selectedSetId: string | null;
  setSelectedSetId: (value: string | null) => void;
  onAddCritical: (critical: PlayerAnalysisCriticalPosition) => void;
  /** Adds the position to the card's "My mistakes" queue (8.7), when the card has one. */
  onAddToMistakes?: (criticals: PlayerAnalysisCriticalPosition[]) => void;
}) {
  const { t } = useTranslation();
  const {
    engineId,
    setEngineId,
    localEngines,
    engineGames,
    setEngineGames,
    analyzeAllGames,
    setAnalyzeAllGames,
    engineTimeMs,
    setEngineTimeMs,
    engineTimeControls,
    setEngineTimeControls,
    engineTimeControlCounts,
    eligibleGames,
    explicitGames,
    clearExplicitGames,
    loadedGames,
    sampleSize,
    engineLoading,
    engineProgress,
    engineCount,
  } = controls;

  return (
    <Stack>
      {explicitGames === null ? (
        <>
          <Alert color="blue">
            {t(
              "PlayerAnalysis.EngineScope",
              "The engine analyzes the newest games in the filtered sample. Results are cached by game, engine and limit, so an interrupted run can continue.",
            )}
          </Alert>
          <MultiSelect
            label={t("PlayerAnalysis.EngineTimeControls", "Time controls to analyze")}
            description={t(
              "PlayerAnalysis.EngineTimeControlsDescription",
              "Choose one or more rhythms. The most recent game limit is applied after combining them.",
            )}
            placeholder={t("PlayerAnalysis.SelectTimeControls", "Select at least one time control")}
            searchable
            clearable
            hidePickedOptions
            value={engineTimeControls}
            data={engineTimeControlCounts.map(({ value, count }) => ({
              value,
              label: `${timeControlLabel(value, t)} (${count})`,
            }))}
            onChange={(values) => setEngineTimeControls(values as PlayerAnalysisTimeControl[])}
          />
          <Text size="xs" c="dimmed">
            {t(
              "PlayerAnalysis.EngineSampleScope",
              "{{eligible}} eligible games; {{selected}} will be analyzed with the current limit.",
              {
                eligible: eligibleGames,
                selected: analyzeAllGames ? eligibleGames : Math.min(engineGames, eligibleGames),
              },
            )}
          </Text>
        </>
      ) : (
        // Games chosen in the Games tab replace the time controls and the limit, so those
        // controls are hidden instead of showing numbers that do not apply.
        <Alert color={explicitGames > 0 ? "teal" : "yellow"}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              {explicitGames > 0
                ? t(
                    "PlayerAnalysis.ExplicitGamesScope",
                    "The {{count}} games chosen in the Games tab will be analyzed, whatever their time control. Results are cached by game, engine and limit, so an interrupted run can continue.",
                    { count: explicitGames },
                  )
                : t(
                    "PlayerAnalysis.ExplicitGamesOutsideFilters",
                    "None of the games chosen in the Games tab is inside the current analysis filters. Widen the filters or go back to the most recent games.",
                  )}
            </Text>
            <Button
              size="xs"
              variant="default"
              disabled={engineLoading}
              onClick={clearExplicitGames}
            >
              {t("PlayerAnalysis.UseRecentGames", "Analyze the most recent games instead")}
            </Button>
          </Stack>
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Select
          label={t("PlayerAnalysis.Engine", "Engine")}
          value={engineId}
          allowDeselect={false}
          data={localEngines.map((value) => ({ value: value.id, label: value.name }))}
          onChange={(value) => setEngineId(value ?? "")}
          placeholder={t("PlayerAnalysis.NoEngine", "Install a local reference engine")}
        />
        {explicitGames === null && (
          <>
            <NumberInput
              label={t("PlayerAnalysis.EngineGames", "Most recent games to analyze")}
              min={1}
              max={Math.max(1, eligibleGames)}
              step={5}
              value={engineGames}
              disabled={analyzeAllGames}
              onChange={(value) => setEngineGames(typeof value === "number" ? value : 10)}
            />
            <Switch
              mt="xl"
              checked={analyzeAllGames}
              disabled={sampleSize === 0}
              label={t("PlayerAnalysis.EngineAllGames", "Analyze all filtered games ({{count}})", {
                count: eligibleGames,
              })}
              onChange={(event) => setAnalyzeAllGames(event.currentTarget.checked)}
            />
          </>
        )}
        <NumberInput
          label={t("PlayerAnalysis.EngineTime", "Milliseconds per position")}
          min={50}
          max={5000}
          step={50}
          value={engineTimeMs}
          onChange={(value) => setEngineTimeMs(typeof value === "number" ? value : 250)}
        />
      </SimpleGrid>
      <Group>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          disabled={
            !engineId ||
            loadedGames === 0 ||
            explicitGames === 0 ||
            (explicitGames === null && (engineTimeControls.length === 0 || eligibleGames === 0)) ||
            engineLoading
          }
          loading={engineLoading}
          onClick={controls.run}
        >
          {explicitGames
            ? t("PlayerAnalysis.RunExplicitGames", "Analyze {{count}} games", {
                count: explicitGames,
              })
            : t("PlayerAnalysis.RunEngine", "Analyze sample")}
        </Button>
        <Button
          variant="default"
          leftSection={<IconPlayerPause size={16} />}
          disabled={!engineLoading}
          onClick={controls.cancel}
        >
          {t("Common.Cancel", "Cancel")}
        </Button>
        {loadedGames === 0 && (
          <Text size="xs" c="dimmed">
            {t("PlayerAnalysis.LoadFirst", "Recalculate the metadata before running the engine.")}
          </Text>
        )}
      </Group>
      {engineLoading && (
        <Stack gap={4}>
          <Progress value={engineProgress} animated />
          <Text size="xs" c="dimmed">
            {t(
              "PlayerAnalysis.EngineRunCount",
              "{{done}} of {{total}} games analyzed. Progress is saved every minute, and Cancel keeps every game already analyzed.",
              { done: engineCount.done, total: engineCount.total },
            )}
            {engineCount.skipped > 0 &&
              ` ${t("PlayerAnalysis.EngineRunSkipped", "{{count}} skipped.", {
                count: engineCount.skipped,
              })}`}
          </Text>
        </Stack>
      )}
      {engine && (
        <>
          <Divider />
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              {t(
                "PlayerAnalysis.EngineSavedScope",
                "Saved sample: {{analyzed}} of {{eligible}} eligible games",
                {
                  analyzed: engine.analyzedGames,
                  eligible: engine.eligibleGames,
                },
              )}
            </Text>
            {engine.timeControlBreakdown.map((item) => (
              <Badge key={item.value} size="sm" variant="light">
                {timeControlLabel(item.value, t)} · {item.analyzedGames}/{item.eligibleGames}
              </Badge>
            ))}
          </Group>
          {engine.clockCoverage && (
            <Alert color={engine.clockCoverage.level === "insufficient" ? "yellow" : "blue"}>
              {t("PlayerAnalysis.ClockCoverage", "Clock coverage")}:{" "}
              {engine.clockCoverage.gamesWithClock}/{engine.clockCoverage.selectedGames} (
              {engine.clockCoverage.percent.toFixed(1)}%) ·{" "}
              {t(
                `PlayerAnalysis.ClockCoverage.${engine.clockCoverage.level}`,
                {
                  insufficient: "Insufficient",
                  exploratory: "Exploratory",
                  adequate: "Adequate",
                  high: "High",
                }[engine.clockCoverage.level],
              )}
              .{" "}
              {t(
                "PlayerAnalysis.ClockCoverageScope",
                "Coverage describes the selected engine sample; Onyx does not publish aggregate time-management conclusions when it is insufficient.",
              )}
            </Alert>
          )}
          {engine.timeManagement && (
            <>
              <Title order={5}>{t("PlayerAnalysis.TimeManagement", "Time management")}</Title>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Metric
                  label={t("PlayerAnalysis.MeasuredDecisions", "Measured decisions")}
                  value={`${engine.timeManagement.measuredDecisions}`}
                />
                <Metric
                  label={t("PlayerAnalysis.AverageDecisionTime", "Average decision time")}
                  value={`${engine.timeManagement.averageDecisionSeconds.toFixed(1)} s`}
                />
                <Metric
                  label={t("PlayerAnalysis.LowTimeMoves", "Moves with 30 s or less")}
                  value={`${engine.timeManagement.lowTimeMoves}`}
                />
              </SimpleGrid>
              <Text size="xs" c="dimmed">
                {t(
                  "PlayerAnalysis.TimeManagementScope",
                  "Decision time is reconstructed only for consecutive player clocks with a simple base+increment time control. {{errors}} critical errors occurred with 30 seconds or less. These figures are descriptive, not causal.",
                  { errors: engine.timeManagement.criticalErrorsInLowTime },
                )}
              </Text>
            </>
          )}
          <SimpleGrid cols={{ base: 2, sm: 6 }}>
            <Metric
              label={t("PlayerAnalysis.AnalyzedGames", "Analyzed games")}
              value={`${engine.analyzedGames}`}
            />
            <Metric label="ACPL" value={formatCp(engine.acpl)} />
            <Metric label={t("PlayerAnalysis.Mistakes", "Mistakes")} value={`${engine.mistakes}`} />
            <Metric label={t("PlayerAnalysis.Blunders", "Blunders")} value={`${engine.blunders}`} />
            <Metric
              label={t("PlayerAnalysis.Conversion", "Advantage conversion")}
              value={formatScore(engine.conversionRate)}
            />
            <Metric
              label={t("PlayerAnalysis.Defense", "Inferior positions saved")}
              value={formatScore(engine.defenseRate)}
            />
          </SimpleGrid>
          <Title order={5}>{t("PlayerAnalysis.ByPhase", "Quality by phase")}</Title>
          <Table withTableBorder striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("PlayerAnalysis.Phase", "Phase")}</Table.Th>
                <Table.Th ta="right">{t("PlayerAnalysis.Moves", "Moves")}</Table.Th>
                <Table.Th ta="right">ACPL</Table.Th>
                <Table.Th ta="right">?! / ? / ??</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {engine.phases.map((phase) => (
                <Table.Tr key={phase.phase}>
                  <Table.Td>{phaseLabel(phase.phase, t)}</Table.Td>
                  <Table.Td ta="right">{phase.moves}</Table.Td>
                  <Table.Td ta="right">{formatCp(phase.acpl)}</Table.Td>
                  <Table.Td ta="right">{`${phase.inaccuracies} / ${phase.mistakes} / ${phase.blunders}`}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <PlayerVerifiableInsights engine={engine} training={training} onOpen={onOpen} />
          {engine.recurringErrors.length > 0 && (
            <>
              <Title order={5}>{t("PlayerAnalysis.Recurring", "Recurring errors")}</Title>
              <Text size="xs" c="dimmed">
                {t(
                  "PlayerAnalysis.RecurringExplanation",
                  "Errors are grouped only when the same normalized position, played move and severity occur at least twice. Open the evidence to inspect each occurrence.",
                )}
              </Text>
              <Table withTableBorder striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("PlayerAnalysis.Opening", "Opening")}</Table.Th>
                    <Table.Th>{t("PlayerAnalysis.Phase", "Phase")}</Table.Th>
                    <Table.Th>{t("PlayerAnalysis.Type", "Type")}</Table.Th>
                    <Table.Th>{t("PlayerAnalysis.PlayedMove", "Played move")}</Table.Th>
                    <Table.Th ta="right">{t("PlayerAnalysis.Count", "Count")}</Table.Th>
                    <Table.Th ta="right">
                      {t("PlayerAnalysis.AverageLoss", "Average loss")}
                    </Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {engine.recurringErrors.map((error) => (
                    <Table.Tr key={error.key}>
                      <Table.Td>{error.opening}</Table.Td>
                      <Table.Td>{phaseLabel(error.phase, t)}</Table.Td>
                      <Table.Td>{classificationLabel(error.classification, t)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" title={error.fen}>
                          {error.playedMove ?? "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">{error.count}</Table.Td>
                      <Table.Td ta="right">{error.averageLoss.toFixed(0)} cp</Table.Td>
                      <Table.Td ta="right">
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          onClick={() => onOpen(error.references[0])}
                        >
                          {t("PlayerAnalysis.Evidence", "Evidence")}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          )}
          <Group justify="space-between" align="end">
            <Title order={5}>{t("PlayerAnalysis.Critical", "Training candidates")}</Title>
            <Group gap="sm" align="end">
              {onAddToMistakes && engine.criticalPositions.length > 0 && (
                // Every error of the analysis, not only the rows shown; the queue skips the ones
                // it already has or that were removed.
                <Button variant="light" onClick={() => onAddToMistakes(engine.criticalPositions)}>
                  {t("PlayerAnalysis.AddAllToMistakes", "Add all to My mistakes")}
                </Button>
              )}
              <Select
                label={t("PlayerAnalysis.TargetSet", "Tactical set")}
                placeholder={t("PlayerAnalysis.CreateSet", "Create “My tactical errors”")}
                clearable
                value={selectedSetId}
                data={tacticsSets.map((set) => ({ value: set.id, label: set.name }))}
                onChange={setSelectedSetId}
              />
            </Group>
          </Group>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("PlayerAnalysis.Game", "Game")}</Table.Th>
                <Table.Th>{t("PlayerAnalysis.Phase", "Phase")}</Table.Th>
                <Table.Th>{t("PlayerAnalysis.Type", "Type")}</Table.Th>
                <Table.Th ta="right">{t("PlayerAnalysis.Loss", "Loss")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {engine.criticalPositions.slice(0, 100).map((critical) => (
                <Table.Tr key={`${critical.key}:${critical.ply}`}>
                  <Table.Td>{critical.gameLabel}</Table.Td>
                  <Table.Td>{phaseLabel(critical.phase, t)}</Table.Td>
                  <Table.Td>{classificationLabel(critical.classification, t)}</Table.Td>
                  <Table.Td ta="right">{critical.cpLoss.toFixed(0)} cp</Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      <Button size="compact-xs" variant="subtle" onClick={() => onOpen(critical)}>
                        {t("PlayerAnalysis.Evidence", "Evidence")}
                      </Button>
                      <Button
                        size="compact-xs"
                        disabled={
                          critical.bestLine.length === 0 && critical.punishmentLine.length === 0
                        }
                        onClick={() => onAddCritical(critical)}
                      >
                        {t("PlayerAnalysis.AddToSet", "Add to set")}
                      </Button>
                      {onAddToMistakes && (
                        <Button
                          size="compact-xs"
                          variant="light"
                          disabled={critical.bestLine.length === 0}
                          onClick={() => onAddToMistakes([critical])}
                        >
                          {t("PlayerAnalysis.AddToMistakes", "To My mistakes")}
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}
