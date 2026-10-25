import { Button, Stack, Text } from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { useTranslation } from "react-i18next";
import type {
  PlayerAnalysisCriticalPosition,
  PlayerAnalysisExercisePerspective,
} from "@/utils/playerAnalysis";

/** Asks which side of an error to train before adding it to a tactical set. */
export default function PerspectiveModal({
  pendingCritical,
  setPendingCritical,
  addCriticalToSet,
}: {
  pendingCritical: PlayerAnalysisCriticalPosition | null;
  setPendingCritical: (value: PlayerAnalysisCriticalPosition | null) => void;
  addCriticalToSet: (
    critical: PlayerAnalysisCriticalPosition,
    perspective: PlayerAnalysisExercisePerspective,
  ) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={pendingCritical !== null}
      onClose={() => setPendingCritical(null)}
      title={t("PlayerAnalysis.PerspectiveQuestion", "Choose the exercise perspective")}
      centered
    >
      {pendingCritical && (
        <Stack>
          <Text size="sm" c="dimmed">
            {t(
              "PlayerAnalysis.PerspectiveQuestionDescription",
              "Choose which side of this error you want to train. The selected perspective will be saved in the exercise.",
            )}
          </Text>
          <div>
            <Button
              fullWidth
              variant="light"
              disabled={pendingCritical.bestLine.length === 0}
              onClick={() => {
                addCriticalToSet(pendingCritical, "improveDecision");
                setPendingCritical(null);
              }}
            >
              {t("PlayerAnalysis.PerspectiveImprove", "Improve my decision")}
            </Button>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "PlayerAnalysis.PerspectiveImproveDescription",
                "The exercise starts before your mistake and asks you to find the better decision.",
              )}
            </Text>
          </div>
          <div>
            <Button
              fullWidth
              variant="light"
              disabled={pendingCritical.punishmentLine.length === 0}
              onClick={() => {
                addCriticalToSet(pendingCritical, "punishError");
                setPendingCritical(null);
              }}
            >
              {t("PlayerAnalysis.PerspectivePunish", "Punish my error")}
            </Button>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "PlayerAnalysis.PerspectivePunishDescription",
                "The exercise starts after your mistake and asks you to find the opponent's punishment.",
              )}
            </Text>
          </div>
        </Stack>
      )}
    </Modal>
  );
}
