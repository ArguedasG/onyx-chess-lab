import { Alert, Button, Group, Radio, Select, Stack, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import type { OpeningsState } from "@/utils/trainingAreas";

/**
 * Removing a section: its lines go with it or move to another section of the same repertoire,
 * where they keep their training progress.
 */
export default function OpeningSectionDeleteModal({
  openings,
  variantId,
  busy,
  onClose,
  onConfirm,
}: {
  openings: OpeningsState;
  variantId: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (moveLinesTo: string | null) => void;
}) {
  const { t } = useTranslation();
  const variant = variantId ? openings.variants[variantId] : undefined;
  const others = variant
    ? (openings.repertoires[variant.repertoireId]?.variantIds ?? [])
        .map((id) => openings.variants[id])
        .filter(
          (other) => other && other.id !== variant.id && other.contentType === variant.contentType,
        )
    : [];
  const lineCount = variant?.lineIds.length ?? 0;
  // The parent remounts the modal (key) for each section, so these start fresh.
  const [mode, setMode] = useState<"move" | "delete">("move");
  const [target, setTarget] = useState<string | null>(others[0]?.id ?? null);

  const canMove = others.length > 0 && lineCount > 0;
  const moving = canMove && mode === "move";

  return (
    <Modal
      opened={variant !== undefined}
      onClose={() => !busy && onClose()}
      title={t("OpeningManage.DeleteSection.Title", "Delete the section “{{name}}”?", {
        name: variant?.name ?? "",
      })}
      size="md"
    >
      <Stack>
        {lineCount === 0 ? (
          <Text size="sm">
            {t("OpeningManage.DeleteSection.Empty", "The section has no lines.")}
          </Text>
        ) : (
          <Radio.Group
            value={moving ? "move" : "delete"}
            onChange={(value) => setMode(value as "move" | "delete")}
          >
            <Stack gap="sm">
              <Radio
                value="move"
                disabled={!canMove}
                label={t(
                  "OpeningManage.DeleteSection.Move",
                  "Move its {{count}} lines to another section",
                  {
                    count: lineCount,
                  },
                )}
                description={
                  canMove
                    ? t(
                        "OpeningManage.DeleteSection.Move.Desc",
                        "They keep their training progress.",
                      )
                    : t(
                        "OpeningManage.DeleteSection.Move.None",
                        "This repertoire has no other section of the same type.",
                      )
                }
              />
              {moving && (
                <Select
                  ml="xl"
                  data={others.map((other) => ({ value: other.id, label: other.name }))}
                  value={target}
                  onChange={setTarget}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: false }}
                />
              )}
              <Radio
                value="delete"
                label={t("OpeningManage.DeleteSection.Delete", "Delete its {{count}} lines too", {
                  count: lineCount,
                })}
                description={t(
                  "OpeningManage.DeleteSection.Delete.Desc",
                  "Their training progress is lost.",
                )}
              />
            </Stack>
          </Radio.Group>
        )}
        <Alert color="gray" icon={<IconInfoCircle size={16} />}>
          {t(
            "OpeningManage.DeleteSection.Source",
            "The editable PGN of the repertoire is rewritten; the original imported file is not touched.",
          )}
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" disabled={busy} onClick={onClose}>
            {t("Common.Cancel", "Cancel")}
          </Button>
          <Button
            color="red"
            loading={busy}
            disabled={moving && !target}
            onClick={() => onConfirm(moving ? target : null)}
          >
            {moving
              ? t("OpeningManage.DeleteSection.ConfirmMove", "Move the lines and delete")
              : t("OpeningManage.DeleteSection.Confirm", "Delete the section")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
