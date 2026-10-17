import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconDatabase,
  IconEye,
  IconPlayerPlay,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import {
  getEndgameSetProgress,
  isEndgamePositionCompleted,
  type EndgamePosition,
  type EndgameSet,
  type EndgamesState,
  type TrainingObjective,
} from "@/utils/trainingAreas";
import { getEndgameThemeMetadata } from "./endgameThemes";

export type ObjectiveProgress = { setId: string; done: number; total: number };

export function EndgameUserSets({
  state,
  sets,
  resolving,
  onImport,
  onResolve,
  onCancelResolve,
  onDelete,
  onObjective,
  onAcceptComputed,
  onAnalyze,
  onTrain,
  onPlay,
}: {
  state: EndgamesState;
  sets: EndgameSet[];
  resolving: ObjectiveProgress | null;
  onImport: () => void;
  onResolve: (set: EndgameSet) => void;
  onCancelResolve: () => void;
  onDelete: (setId: string) => void;
  onObjective: (positionId: string, objective: TrainingObjective) => void;
  onAcceptComputed: (positionId: string) => void;
  onAnalyze: (position: EndgamePosition) => void;
  onTrain: (position: EndgamePosition, setId: string) => void;
  onPlay: (position: EndgamePosition, setId: string) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const themes = getEndgameThemeMetadata(trainingT);
  const objectiveLabel = (objective: TrainingObjective) =>
    objective === "win"
      ? trainingT("Training.Copy.Win.fc572f64", "Win")
      : objective === "draw"
        ? trainingT("Training.Copy.Draw.9c0dd07e", "Draw")
        : objective === "loss"
          ? trainingT("Training.Copy.Defend.69d716e2", "Defend")
          : trainingT("Training.Copy.Tobedetermined.20317191", "To be determined");

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <Text size="sm" c="dimmed">
          {trainingT(
            "Endgames.Sets.Description",
            "Your imported endgames. Their positions also appear by theme.",
          )}
        </Text>
        <Button color="teal" leftSection={<IconUpload size={16} />} onClick={onImport}>
          {trainingT("Endgames.Sets.Import", "Import PGN")}
        </Button>
      </Group>

      {sets.length === 0 && (
        <Card withBorder>
          <Stack align="center" py="lg" gap="xs">
            <Text c="dimmed">
              {trainingT(
                "Training.Copy.Youhavenotimportedany.bcb93682",
                "You have not imported any sets yet.",
              )}
            </Text>
            <Text size="sm" c="dimmed" ta="center" maw={520}>
              {trainingT(
                "Endgames.Sets.EmptyHint",
                "A PGN can hold a whole book: you can split it by theme or chapter when importing.",
              )}
            </Text>
          </Stack>
        </Card>
      )}

      {sets.map((set) => {
        const progress = getEndgameSetProgress(state, set.id);
        const positions = set.positionIds.flatMap((id) =>
          state.positions[id] ? [state.positions[id]] : [],
        );
        const conflicts = positions.filter((position) => position.computedObjective).length;
        const pending = positions.filter((position) => position.objective === "unknown").length;
        const busy = resolving?.setId === set.id;
        return (
          <Card key={set.id} withBorder>
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Title order={4}>{set.name}</Title>
                  <Text size="sm" c="dimmed">
                    {set.description ||
                      trainingT("Training.Copy.Userimportedset.aab5b452", "User-imported set.")}
                  </Text>
                </div>
                <Group gap="xs" wrap="nowrap">
                  <Badge color="teal">
                    {progress.completed}/{progress.total}
                  </Badge>
                  <Tooltip label={trainingT("Training.Copy.Delete.c9894cf0", "Delete")}>
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      aria-label={trainingT("Training.Copy.Delete.c9894cf0", "Delete")}
                      onClick={() => onDelete(set.id)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
              <Progress value={progress.percent} color="teal" />
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconDatabase size={14} />}
                  disabled={resolving !== null && !busy}
                  onClick={() => (busy ? onCancelResolve() : onResolve(set))}
                >
                  {busy
                    ? trainingT("Endgames.Sets.Stop", "Stop ({{done}}/{{total}})", {
                        done: resolving.done,
                        total: resolving.total,
                      })
                    : trainingT(
                        "Training.Copy.Calculateobjectives.7219a82e",
                        "Calculate objectives",
                      )}
                </Button>
                {pending > 0 && !busy && (
                  <Text size="xs" c="dimmed">
                    {trainingT("Endgames.Sets.Pending", "{{count}} without objective", {
                      count: pending,
                    })}
                  </Text>
                )}
                {conflicts > 0 && (
                  <Badge
                    color="orange"
                    variant="light"
                    leftSection={<IconAlertTriangle size={12} />}
                  >
                    {trainingT("Endgames.Sets.Conflicts", "{{count}} disagree with the PGN", {
                      count: conflicts,
                    })}
                  </Badge>
                )}
              </Group>
              <ScrollArea.Autosize mah={420} type="auto">
                <Stack gap={6} pr="sm">
                  {positions.map((position, index) => (
                    <Group key={position.id} justify="space-between" wrap="nowrap" gap="xs">
                      <Group wrap="nowrap" gap="xs" style={{ minWidth: 0 }}>
                        <Badge variant="outline" miw={34}>
                          {index + 1}
                        </Badge>
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={500} truncate>
                            {position.title}
                          </Text>
                          <Group gap={4}>
                            <Badge size="xs" variant="light" color="teal">
                              {themes.find((theme) => theme.id === position.theme)?.label}
                            </Badge>
                            {position.computedObjective && (
                              <Tooltip
                                label={trainingT(
                                  "Endgames.Sets.ConflictTip",
                                  "The PGN says {{written}}; the {{source}} says {{computed}}.",
                                  {
                                    written: objectiveLabel(position.objective),
                                    computed: objectiveLabel(position.computedObjective),
                                    source:
                                      position.computedSource === "tablebase"
                                        ? trainingT("Endgame.Watch.Tablebase", "Tablebase")
                                        : trainingT("Endgame.Watch.Engine", "Engine"),
                                  },
                                )}
                              >
                                <Badge
                                  size="xs"
                                  color="orange"
                                  variant="light"
                                  style={{ cursor: "pointer" }}
                                  onClick={() => onAcceptComputed(position.id)}
                                >
                                  {trainingT("Endgames.Sets.UseComputed", "Use {{objective}}", {
                                    objective: objectiveLabel(position.computedObjective),
                                  })}
                                </Badge>
                              </Tooltip>
                            )}
                          </Group>
                        </div>
                      </Group>
                      <Group wrap="nowrap" gap={4}>
                        <Select
                          size="xs"
                          w={130}
                          value={position.objective}
                          allowDeselect={false}
                          data={(["unknown", "win", "draw", "loss"] as const).map((value) => ({
                            value,
                            label: objectiveLabel(value),
                          }))}
                          onChange={(value) =>
                            value && onObjective(position.id, value as TrainingObjective)
                          }
                        />
                        {isEndgamePositionCompleted(position) && (
                          <Tooltip
                            label={trainingT("Training.Copy.Completed.856641d2", "Completed")}
                          >
                            <IconCheck size={16} color="var(--mantine-color-teal-6)" />
                          </Tooltip>
                        )}
                        <Tooltip label={trainingT("Training.Copy.Analyze.67ffbe0d", "Analyze")}>
                          <ActionIcon
                            variant="subtle"
                            aria-label={trainingT("Training.Copy.Analyze.67ffbe0d", "Analyze")}
                            onClick={() => onAnalyze(position)}
                          >
                            <IconSearch size={15} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={trainingT("Endgames.Quiz.Train", "Train")}>
                          <ActionIcon
                            variant="subtle"
                            aria-label={trainingT("Endgames.Quiz.Train", "Train")}
                            onClick={() => onTrain(position, set.id)}
                          >
                            <IconEye size={15} />
                          </ActionIcon>
                        </Tooltip>
                        <Button
                          size="xs"
                          variant="light"
                          color="teal"
                          leftSection={<IconPlayerPlay size={14} />}
                          onClick={() => onPlay(position, set.id)}
                        >
                          {trainingT("Endgames.Quiz.Play", "Play")}
                        </Button>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
