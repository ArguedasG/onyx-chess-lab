import { Alert, Badge, Button, Group, Loader, Paper, Progress, Stack, Text } from "@mantine/core";
import {
  IconArrowRight,
  IconBulb,
  IconCheck,
  IconPlayerSkipForward,
  IconSchool,
  IconTarget,
  IconX,
} from "@tabler/icons-react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { retroExplanation, retroRunsOn, samePath } from "@/utils/retro";
import MistakeExplanation from "./MistakeExplanation";
import { useRetroActions } from "./useRetro";

/** "Learn from your mistakes" for the analysed game, after the report. */
export default function RetroPanel({
  whiteMistakes,
  blackMistakes,
}: {
  whiteMistakes: number;
  blackMistakes: number;
}) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const { retro, start, next, skip, showSolution, goToExercise, close } = useRetroActions();

  if (!retro || (retro.phase !== "done" && !retroRunsOn(retro, root))) {
    if (whiteMistakes + blackMistakes === 0) return null;
    return (
      <Paper withBorder p="sm">
        <Group gap="xs" mb={4}>
          <IconSchool size={18} />
          <Text fw={600}>{t("Board.Retro.Title")}</Text>
        </Group>
        <Text size="xs" c="dimmed" mb="xs">
          {t("Board.Retro.Description")}
        </Text>
        <Group grow>
          <Button
            size="xs"
            variant="default"
            disabled={whiteMistakes === 0}
            onClick={() => start("white")}
          >
            {t("Board.Retro.StartWhite", { count: whiteMistakes })}
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={blackMistakes === 0}
            onClick={() => start("black")}
          >
            {t("Board.Retro.StartBlack", { count: blackMistakes })}
          </Button>
        </Group>
      </Paper>
    );
  }

  const total = retro.items.length;
  const item = retro.items[retro.index];
  const solved = retro.results.filter((result) => result === "solved").length;
  const done = retro.phase === "done";
  const offPosition = !done && !!item && !samePath(position, item.path.slice(0, -1));
  const colorName = retro.color === "white" ? t("Fen.White") : t("Fen.Black");

  return (
    <Paper withBorder p="sm">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <IconSchool size={18} />
          <Text fw={600}>{t("Board.Retro.Title")}</Text>
          <Badge variant="light" size="sm">
            {colorName}
          </Badge>
        </Group>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          leftSection={<IconX size={14} />}
          onClick={close}
        >
          {t("Board.Retro.Close")}
        </Button>
      </Group>
      <Progress
        size="sm"
        mb="sm"
        value={total === 0 ? 100 : ((done ? total : retro.index) / total) * 100}
      />

      {done ? (
        <Stack gap="xs">
          <Text>
            {total === 0
              ? t("Board.Retro.NoMistakes")
              : t("Board.Retro.Finished", { solved, total })}
          </Text>
          <Group>
            <Button size="xs" onClick={() => start(retro.color)} disabled={total === 0}>
              {t("Board.Retro.Again")}
            </Button>
            <Button size="xs" variant="default" onClick={close}>
              {t("Board.Retro.Close")}
            </Button>
          </Group>
        </Stack>
      ) : (
        item && (
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {t("Board.Retro.Progress", { current: retro.index + 1, total })}
            </Text>
            <Text>
              {t("Board.Retro.YouPlayed")}{" "}
              <Text span fw={700} c={item.annotation === "??" ? "red" : "orange"}>
                {item.san}
                {item.annotation}
              </Text>
            </Text>

            {retro.phase === "find" && (
              <Group gap="xs" wrap="nowrap">
                <IconTarget size={18} />
                <Text size="sm">{t("Board.Retro.FindBetter", { color: colorName })}</Text>
              </Group>
            )}
            {retro.phase === "evaluating" && (
              <Group gap="xs" wrap="nowrap">
                <Loader size="xs" />
                <Text size="sm">
                  {retro.attempt
                    ? t("Board.Retro.Evaluating", { move: retro.attempt.san })
                    : t("Board.Retro.Searching")}
                </Text>
              </Group>
            )}
            {retro.phase === "correct" && retro.attempt && (
              <Alert color="green" icon={<IconCheck size={18} />} p="xs">
                {t("Board.Retro.Correct", { move: retro.attempt.san })}
                {item.best && item.best.uci !== retro.attempt.uci && (
                  <Text size="xs" mt={4}>
                    {t("Board.Retro.EngineBest", { move: item.best.san })}
                  </Text>
                )}
                <MistakeExplanation
                  sentences={retroExplanation(retro).filter(
                    // The alert above already names the engine's best move.
                    (sentence) => !sentence.key.startsWith("Explain.Best"),
                  )}
                />
              </Alert>
            )}
            {retro.phase === "wrong" && (
              <Alert color="red" icon={<IconX size={18} />} p="xs">
                {retro.feedback === "same-move"
                  ? t("Board.Retro.SameMove")
                  : retro.feedback === "no-engine"
                    ? t("Board.Retro.NoEngine")
                    : retro.feedback === "engine-error"
                      ? t("Board.Retro.EngineError")
                      : t("Board.Retro.Worse", { move: retro.attempt?.san ?? "" })}
              </Alert>
            )}
            {retro.phase === "solution" && item.best && (
              <Alert color="blue" icon={<IconBulb size={18} />} p="xs">
                {t("Board.Retro.Solution", { move: item.best.san })}
                <MistakeExplanation
                  sentences={retroExplanation(retro).filter(
                    (sentence) => !sentence.key.startsWith("Explain.Best"),
                  )}
                />
              </Alert>
            )}

            {offPosition && (
              <Button size="xs" variant="light" onClick={goToExercise}>
                {t("Board.Retro.BackToPosition")}
              </Button>
            )}

            <Group gap="xs">
              {(retro.phase === "find" || retro.phase === "wrong") && (
                <>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconBulb size={14} />}
                    onClick={() => void showSolution()}
                  >
                    {t("Board.Retro.ShowSolution")}
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<IconPlayerSkipForward size={14} />}
                    onClick={skip}
                  >
                    {t("Board.Retro.Skip")}
                  </Button>
                </>
              )}
              {(retro.phase === "correct" || retro.phase === "solution") && (
                <Button size="xs" rightSection={<IconArrowRight size={14} />} onClick={next}>
                  {retro.index + 1 < total ? t("Board.Retro.Next") : t("Board.Retro.Finish")}
                </Button>
              )}
            </Group>
          </Stack>
        )
      )}
    </Paper>
  );
}
