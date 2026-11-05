import {
  Badge,
  Button,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  type Icon,
  IconCheck,
  IconCpu,
  IconDatabase,
  IconPuzzle,
  IconUserCircle,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PuzzleDatabaseInfo } from "@/bindings";
import AddPuzzle from "@/components/puzzles/AddPuzzle";
import { useOpenEngineSetup, useRecommendedEnginesReady } from "@/hooks/useRecommendedEngines";
import { referenceDbAtom, sessionsAtom } from "@/state/atoms";
import { getPuzzleDatabases } from "@/utils/puzzles";
import classes from "./FirstSteps.module.css";

const firstStepsHiddenAtom = atomWithStorage<boolean>("first-steps-hidden", false, undefined, {
  getOnInit: true,
});

function Step({
  index,
  icon: StepIcon,
  title,
  description,
  done,
  optional,
  action,
  onAction,
}: {
  index: number;
  icon: Icon;
  title: string;
  description: string;
  done: boolean;
  optional?: boolean;
  action: string;
  onAction: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={classes.step} data-done={done || undefined}>
      <Stack gap="sm" h="100%">
        <Group justify="space-between" wrap="nowrap">
          <ThemeIcon size={34} radius="md" variant="light" color={done ? "teal" : undefined}>
            {done ? <IconCheck size={18} /> : <StepIcon size={18} />}
          </ThemeIcon>
          <Text size="xs" c="dimmed" fw={600}>
            {optional ? t("FirstSteps.Optional") : t("FirstSteps.StepN", { n: index })}
          </Text>
        </Group>
        <div>
          <Text fw={600}>{title}</Text>
          <Text size="sm" c="dimmed" mt={4}>
            {description}
          </Text>
        </div>
        <Group mt="auto">
          {done ? (
            <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
              {t("FirstSteps.Done")}
            </Badge>
          ) : (
            <Button size="xs" variant={optional ? "default" : "filled"} onClick={onAction}>
              {action}
            </Button>
          )}
        </Group>
      </Stack>
    </div>
  );
}

/**
 * What a new installation needs before most of Onyx works: engines, a reference database, puzzles
 * and, optionally, an online account. It disappears once the three required steps are done or
 * when the user hides it; every step stays available in its own section.
 */
export default function FirstSteps() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hidden, setHidden] = useAtom(firstStepsHiddenAtom);
  const openEngineSetup = useOpenEngineSetup();
  const enginesReady = useRecommendedEnginesReady();
  const referenceDb = useAtomValue(referenceDbAtom);
  const sessions = useAtomValue(sessionsAtom);
  const [puzzleDbs, setPuzzleDbs] = useState<PuzzleDatabaseInfo[] | null>(null);
  const [puzzlesOpen, setPuzzlesOpen] = useState(false);

  useEffect(() => {
    void getPuzzleDatabases()
      .then(setPuzzleDbs)
      .catch(() => setPuzzleDbs([]));
  }, []);

  const required = [enginesReady, Boolean(referenceDb), (puzzleDbs?.length ?? 0) > 0];
  const accountDone = sessions.length > 0;
  const doneCount = required.filter(Boolean).length + (accountDone ? 1 : 0);

  // Waits for the puzzle check so a finished setup never flashes on screen.
  if (hidden || puzzleDbs === null || required.every(Boolean)) return null;

  return (
    <div className={classes.panel}>
      <AddPuzzle
        puzzleDbs={puzzleDbs}
        opened={puzzlesOpen}
        setOpened={setPuzzlesOpen}
        setPuzzleDbs={(value) =>
          setPuzzleDbs((current) => (typeof value === "function" ? value(current ?? []) : value))
        }
      />
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm" mb="md">
        <div>
          <Text fw={700} size="lg">
            {t("FirstSteps.Title")}
          </Text>
          <Text size="sm" c="dimmed" mt={2}>
            {t("FirstSteps.Subtitle")}
          </Text>
        </div>
        <Group gap="sm" wrap="nowrap">
          <Stack gap={4} w={140}>
            <Text size="xs" c="dimmed" ta="right">
              {t("FirstSteps.Progress", { done: doneCount, total: 4 })}
            </Text>
            <Progress value={(doneCount / 4) * 100} size="sm" color="teal" />
          </Stack>
          <Tooltip label={t("FirstSteps.HideHint")} multiline w={240}>
            <Button size="xs" variant="subtle" color="gray" onClick={() => setHidden(true)}>
              {t("FirstSteps.Hide")}
            </Button>
          </Tooltip>
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
        <Step
          index={1}
          icon={IconCpu}
          title={t("FirstSteps.Engines.Title")}
          description={t("FirstSteps.Engines.Desc")}
          done={enginesReady}
          action={t("FirstSteps.Engines.Action")}
          onAction={() => openEngineSetup()}
        />
        <Step
          index={2}
          icon={IconDatabase}
          title={t("FirstSteps.Database.Title")}
          description={t("FirstSteps.Database.Desc")}
          done={Boolean(referenceDb)}
          action={t("FirstSteps.Database.Action")}
          onAction={() => void navigate({ to: "/databases", search: { add: true } })}
        />
        <Step
          index={3}
          icon={IconPuzzle}
          title={t("FirstSteps.Puzzles.Title")}
          description={t("FirstSteps.Puzzles.Desc")}
          done={(puzzleDbs?.length ?? 0) > 0}
          action={t("FirstSteps.Puzzles.Action")}
          onAction={() => setPuzzlesOpen(true)}
        />
        <Step
          index={4}
          icon={IconUserCircle}
          optional
          title={t("FirstSteps.Account.Title")}
          description={t("FirstSteps.Account.Desc")}
          done={accountDone}
          action={t("FirstSteps.Account.Action")}
          onAction={() => void navigate({ to: "/accounts" })}
        />
      </SimpleGrid>
    </div>
  );
}
