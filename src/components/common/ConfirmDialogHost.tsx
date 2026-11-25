import { Button, Group, Stack, Text } from "@mantine/core";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { answerConfirm, currentConfirm, subscribeConfirm } from "@/utils/confirmDialog";

/** Shows the questions asked with `confirmDialog`, one at a time. Mounted once in the root layout. */
export default function ConfirmDialogHost() {
  const { t } = useTranslation();
  const pending = useSyncExternalStore(subscribeConfirm, currentConfirm);

  return (
    <Modal
      opened={pending !== null}
      onClose={() => pending && answerConfirm(pending.id, false)}
      title={
        <Text fz="lg" fw="bold">
          {pending?.title}
        </Text>
      }
      centered
    >
      {pending && (
        <Stack>
          <Text style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
            {pending.message}
          </Text>
          <Group justify="right">
            <Button
              variant="default"
              data-autofocus={pending.danger || undefined}
              onClick={() => answerConfirm(pending.id, false)}
            >
              {t("Common.Cancel")}
            </Button>
            <Button
              color={pending.danger ? "red" : undefined}
              data-autofocus={!pending.danger || undefined}
              onClick={() => answerConfirm(pending.id, true)}
            >
              {pending.confirmLabel ?? t("ConfirmDialog.Continue", "Continue")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
