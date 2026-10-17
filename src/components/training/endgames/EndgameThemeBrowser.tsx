import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconChess,
  IconChevronRight,
  IconDice5,
  IconEye,
  IconPlayerPlay,
  IconSearch,
  IconTrophy,
} from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import { ENDGAME_THEME_ORDER } from "@/utils/endgameImport";
import {
  endgameOutcomeGuessFromObjective,
  isEndgamePositionCompleted,
  type EndgamePosition,
  type EndgameTheme,
} from "@/utils/trainingAreas";
import { getEndgameThemeMetadata } from "./endgameThemes";

export type EndgameEntry = { position: EndgamePosition; setId: string; origin: "bundled" | "user" };
type SourceFilter = "all" | "bundled" | "user";

/**
 * Endgames by theme (I-09): the material family is the only filter and it covers the included
 * content and what the user imported alike.
 */
export function EndgameThemeBrowser({
  entries,
  onTrain,
  onAnalyze,
  onPlay,
  onNoRandomCandidate,
}: {
  entries: EndgameEntry[];
  onTrain: (entry: EndgameEntry) => void;
  onAnalyze: (position: EndgamePosition) => void;
  onPlay: (entry: EndgameEntry) => void;
  onNoRandomCandidate: () => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const themes = getEndgameThemeMetadata(trainingT);
  const [theme, setTheme] = useState<EndgameTheme | "all">("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const lastRandomId = useRef<string | null>(null);
  const hasUserContent = entries.some((entry) => entry.origin === "user");

  const bySource = useMemo(
    () => entries.filter((entry) => source === "all" || entry.origin === source),
    [entries, source],
  );
  const visible = theme === "all" ? [] : bySource.filter((entry) => entry.position.theme === theme);
  const completed = bySource.filter((entry) => isEndgamePositionCompleted(entry.position)).length;

  function trainRandom() {
    const candidates = visible.filter(({ position }) =>
      endgameOutcomeGuessFromObjective(position.objective, position.studentColor),
    );
    if (candidates.length === 0) {
      onNoRandomCandidate();
      return;
    }
    const pool =
      candidates.length > 1
        ? candidates.filter(({ position }) => position.id !== lastRandomId.current)
        : candidates;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    lastRandomId.current = selected.position.id;
    onTrain(selected);
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <Chip.Group
          multiple={false}
          value={theme}
          onChange={(value) => setTheme(value as EndgameTheme | "all")}
        >
          <Group gap="xs">
            <Chip value="all" color="teal" variant="light">
              {trainingT("Endgames.Themes.All", "All themes")}
            </Chip>
            {ENDGAME_THEME_ORDER.map((id) => {
              const count = bySource.filter((entry) => entry.position.theme === id).length;
              if (count === 0) return null;
              return (
                <Chip key={id} value={id} color="teal" variant="light">
                  {themes.find((item) => item.id === id)?.label} · {count}
                </Chip>
              );
            })}
          </Group>
        </Chip.Group>
        {hasUserContent && (
          <SegmentedControl
            size="xs"
            value={source}
            onChange={(value) => setSource(value as SourceFilter)}
            data={[
              { value: "all", label: trainingT("Endgames.Themes.SourceAll", "All") },
              { value: "bundled", label: trainingT("Training.Copy.Included.384f88d5", "Included") },
              { value: "user", label: trainingT("Endgames.Themes.SourceUser", "Imported") },
            ]}
          />
        )}
      </Group>

      {theme === "all" ? (
        <>
          <Text size="sm" c="dimmed">
            {trainingT(
              "Endgames.Themes.Completed",
              "{{completed}} of {{total}} endgames completed.",
              {
                completed,
                total: bySource.length,
              },
            )}
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {themes.map((item) => {
              const positions = bySource.filter((entry) => entry.position.theme === item.id);
              if (positions.length === 0) return null;
              const done = positions.filter((entry) =>
                isEndgamePositionCompleted(entry.position),
              ).length;
              return (
                <Card key={item.id} withBorder>
                  <Stack h="100%" justify="space-between">
                    <div>
                      <Group justify="space-between">
                        <IconChess size={28} />
                        <Badge color="teal">{positions.length}</Badge>
                      </Group>
                      <Title order={4} mt="md">
                        {item.label}
                      </Title>
                      <Text size="sm" c="dimmed" mt="xs" mih={42}>
                        {item.description}
                      </Text>
                      <Progress value={(done / positions.length) * 100} color="teal" mt="md" />
                      <Text size="xs" c="dimmed" mt={4}>
                        {done} {trainingT("Training.Copy.completed.9f880723", "completed")}
                      </Text>
                    </div>
                    <Button
                      mt="md"
                      color="teal"
                      rightSection={<IconChevronRight size={16} />}
                      onClick={() => setTheme(item.id)}
                    >
                      {trainingT("Training.Copy.Opentheme.2c1b7643", "Open theme")}
                    </Button>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </>
      ) : visible.length === 0 ? (
        <Alert color="blue">
          {trainingT(
            "Training.Copy.Noincludedpositionsforthis.2378ec53",
            "No included positions for this theme.",
          )}
        </Alert>
      ) : (
        <>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {trainingT(
                "Training.Copy.Chooseapositiontopractice.21897c47",
                "Choose a position to practice.",
              )}
            </Text>
            <Button color="teal" leftSection={<IconDice5 size={16} />} onClick={trainRandom}>
              {trainingT("Endgames.Quiz.RandomPosition", "Random position")}
            </Button>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
            {visible.map((entry, index) => (
              <EndgamePositionCard
                key={entry.position.id}
                entry={entry}
                index={index}
                onTrain={() => onTrain(entry)}
                onAnalyze={() => onAnalyze(entry.position)}
                onPlay={() => onPlay(entry)}
              />
            ))}
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}

function EndgamePositionCard({
  entry,
  index,
  onTrain,
  onAnalyze,
  onPlay,
}: {
  entry: EndgameEntry;
  index: number;
  onTrain: () => void;
  onAnalyze: () => void;
  onPlay: () => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const { position } = entry;

  return (
    <Card withBorder>
      <Stack h="100%" justify="space-between">
        <div>
          <Group justify="space-between">
            <Group gap={6}>
              <Badge variant="outline">{index + 1}</Badge>
              {entry.origin === "user" && (
                <Badge variant="light" color="gray">
                  {trainingT("Endgames.Themes.SourceUser", "Imported")}
                </Badge>
              )}
            </Group>
            {isEndgamePositionCompleted(position) ? (
              <Badge color="teal" leftSection={<IconTrophy size={12} />}>
                {trainingT("Training.Copy.Completed.856641d2", "Completed")}
              </Badge>
            ) : (
              <Badge color="gray">{trainingT("Training.Copy.Pending.2ef68536", "Pending")}</Badge>
            )}
          </Group>
          <Text fw={600} mt="md">
            {position.title}
          </Text>
          <Text size="xs" c="dimmed" ff="monospace" truncate mt={4}>
            {position.fen}
          </Text>
          {position.progress.recognition.attempts > 0 && (
            <Text size="xs" c="dimmed" mt="sm">
              {trainingT("Endgames.Quiz.Score", "Recognition: {{correct}}/{{attempts}}", {
                correct: position.progress.recognition.successes,
                attempts: position.progress.recognition.attempts,
              })}
            </Text>
          )}
          {position.progress.attempts > 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              {trainingT(
                "Endgames.Card.Attempts",
                "{{successes}} successes in {{attempts}} attempts",
                {
                  successes: position.progress.successes,
                  attempts: position.progress.attempts,
                },
              )}
            </Text>
          )}
        </div>
        <SimpleGrid cols={3} spacing="xs" mt="md">
          <Button variant="default" leftSection={<IconSearch size={15} />} onClick={onAnalyze}>
            {trainingT("Training.Copy.Analyze.67ffbe0d", "Analyze")}
          </Button>
          <Button color="teal" leftSection={<IconEye size={15} />} onClick={onTrain}>
            {trainingT("Endgames.Quiz.Train", "Train")}
          </Button>
          <Button
            color="teal"
            variant="light"
            leftSection={<IconPlayerPlay size={15} />}
            onClick={onPlay}
          >
            {trainingT("Endgames.Quiz.Play", "Play")}
          </Button>
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
