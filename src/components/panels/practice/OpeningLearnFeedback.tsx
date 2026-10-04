import { Alert, Button, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import {
  IconArrowRight,
  IconBulb,
  IconCheck,
  IconFlag,
  IconMessage,
  IconRepeat,
  IconSchool,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { moveNotationTypeAtom, type PracticeState } from "@/state/atoms";
import { addPieceSymbol, formatNumberedMove } from "@/utils/annotation";
import type { TreeNode } from "@/utils/treeReducer";

function LearnComment({ comment }: { comment: string }) {
  if (!comment.trim()) return null;
  return (
    <Paper withBorder p="sm">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <IconMessage size={16} style={{ flexShrink: 0, marginTop: 3 }} />
        <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {comment.trim()}
        </Text>
      </Group>
    </Paper>
  );
}

/** One move of a guided demonstration; clicking it shows its position on the board. */
function LearnMoveEntry({
  label,
  node,
  active,
  onClick,
}: {
  label: string;
  node: TreeNode;
  active: boolean;
  onClick: () => void;
}) {
  const symbols = useAtomValue(moveNotationTypeAtom) === "symbols";
  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={600}>
          {label}
        </Text>
        <UnstyledButton
          onClick={onClick}
          px={6}
          style={{
            borderRadius: "var(--mantine-radius-sm)",
            background: active ? "var(--mantine-color-default-hover)" : undefined,
            outline: active ? "1px solid var(--mantine-color-default-border)" : undefined,
          }}
        >
          <Text size="sm" fw={active ? 700 : 500} c={active ? undefined : "blue"}>
            {formatNumberedMove(
              symbols ? addPieceSymbol(node.san ?? "") : (node.san ?? ""),
              node.halfMoves,
            )}
          </Text>
        </UnstyledButton>
      </Group>
      {node.comment.trim() && (
        <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {node.comment.trim()}
        </Text>
      )}
    </Stack>
  );
}

function ContinueButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button fullWidth variant="light" rightSection={<IconArrowRight size={16} />} onClick={onClick}>
      {label}
    </Button>
  );
}

/**
 * Guidance for Learn mode. Revealed moves and wrong answers during recall reuse the regular line
 * feedback; this component covers the guided steps, the recall prompt and the line result.
 */
export default function OpeningLearnFeedback({
  practiceState,
  comment,
  demo,
  onViewDemoPosition,
  hasNextLine,
  onContinue,
  onNextLine,
  onRestartGuided,
  onRestartRecall,
  onSkip,
}: {
  practiceState: PracticeState;
  /** Comment of the position on the board; shown only while guiding. */
  comment: string;
  /** Guided demonstration: the opponent's move before the shown move, and the shown move. */
  demo: { previous: TreeNode; shown: TreeNode; viewingPrevious: boolean } | null;
  onViewDemoPosition: (which: "previous" | "shown") => void;
  hasNextLine: boolean;
  /** Leaves a guided pause (demonstrated move or final position). */
  onContinue: () => void;
  onNextLine: () => void;
  onRestartGuided: () => void;
  onRestartRecall: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const guided = practiceState.learnStage === "guided";
  const step = practiceState.learnStep ?? "play";
  const mistakes = practiceState.mistakes ?? 0;

  if (practiceState.phase === "waiting" && guided && step === "demo" && demo) {
    const { previous, shown, viewingPrevious } = demo;
    return (
      <Stack gap="xs">
        <Paper withBorder p="sm">
          <Stack gap="sm">
            {previous.san ? (
              <LearnMoveEntry
                label={t("OpeningLearn.OpponentMove", "Opponent")}
                node={previous}
                active={viewingPrevious}
                onClick={() => onViewDemoPosition("previous")}
              />
            ) : (
              previous.comment.trim() && (
                <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {previous.comment.trim()}
                </Text>
              )
            )}
            <LearnMoveEntry
              label={t("OpeningLearn.YourMove", "Your turn")}
              node={shown}
              active={!viewingPrevious}
              onClick={() => onViewDemoPosition("shown")}
            />
          </Stack>
        </Paper>
        <Text size="xs" c="dimmed">
          {t(
            "OpeningLearn.DemoHint",
            "Click a move to see its position. Then you will play your move yourself.",
          )}
        </Text>
        <ContinueButton label={t("OpeningLearn.PlayIt", "Play it")} onClick={onContinue} />
      </Stack>
    );
  }

  if (practiceState.phase === "waiting" && guided && step === "end") {
    return (
      <Stack gap="xs">
        <Alert
          color="teal"
          icon={<IconFlag size={16} />}
          title={t("OpeningLearn.EndTitle", "End of the line")}
        >
          {t(
            "OpeningLearn.EndBody",
            "Take a look at the final position. When you are ready, repeat the line from memory.",
          )}
        </Alert>
        <LearnComment comment={comment} />
        <ContinueButton
          label={t("OpeningLearn.StartRecall", "Repeat from memory")}
          onClick={onContinue}
        />
      </Stack>
    );
  }

  if (practiceState.phase === "waiting") {
    return (
      <Stack gap="xs">
        {guided ? (
          <Alert
            color="blue"
            icon={<IconSchool size={16} />}
            title={t("OpeningLearn.GuidedTitle", "Learn the line")}
          >
            {t(
              "OpeningLearn.RepeatMoveBody",
              "Play the move you just saw, marked by the arrow; the opponent replies automatically. Afterwards you will repeat the line from memory.",
            )}
          </Alert>
        ) : (
          <Alert
            color="grape"
            icon={<IconBulb size={16} />}
            title={t("OpeningLearn.RecallTitle", "Now from memory")}
          >
            {t(
              "OpeningLearn.RecallBody",
              "Repeat the line without help. If you complete it without mistakes it will be marked as learned.",
            )}
          </Alert>
        )}
        {practiceState.feedback === "guided-wrong" && (
          <Alert color="orange">
            {t(
              "OpeningLearn.GuidedWrong",
              "{{move}} is not the move of this line. Follow the arrow.",
              {
                move: practiceState.playedMove,
              },
            )}
          </Alert>
        )}
        {guided && <LearnComment comment={comment} />}
      </Stack>
    );
  }

  if (practiceState.phase === "correct" && practiceState.learnStage === "recall") {
    return mistakes === 0 ? (
      <Stack gap="xs">
        <Alert
          color="teal"
          icon={<IconCheck size={16} />}
          title={t("OpeningLearn.Learned", "Line learned!")}
        >
          {t("OpeningLearn.LearnedStays", "It is now part of your practice.")}
        </Alert>
        <ContinueButton
          label={
            hasNextLine
              ? t("OpeningLearn.NextLine", "Next line")
              : t("OpeningLearn.FinishSession", "Finish session")
          }
          onClick={onNextLine}
        />
      </Stack>
    ) : (
      <Alert
        color="yellow"
        icon={<IconRepeat size={16} />}
        title={t("OpeningLearn.AlmostTitle", "Almost there")}
      >
        <Stack gap="xs">
          <Text size="sm">
            {t(
              "OpeningLearn.AlmostBody",
              "You completed the line with {{count}} mistake(s). Repeat it to mark it as learned.",
              { count: mistakes },
            )}
          </Text>
          <Group gap="xs">
            <Button size="compact-sm" variant="light" onClick={onRestartGuided}>
              {t("OpeningLearn.RepeatGuided", "Repeat with guidance")}
            </Button>
            <Button size="compact-sm" variant="light" color="grape" onClick={onRestartRecall}>
              {t("OpeningLearn.RepeatRecall", "Try from memory again")}
            </Button>
            <Button size="compact-sm" variant="subtle" color="gray" onClick={onSkip}>
              {t("OpeningLearn.Skip", "Skip for now")}
            </Button>
          </Group>
        </Stack>
      </Alert>
    );
  }

  return null;
}
