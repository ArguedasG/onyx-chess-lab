import { Alert, Button, Card, Checkbox, Group, Modal, Stack, Text } from "@mantine/core";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { getOpeningConsolidationGroups } from "@/utils/openingTraining";

export default function OpeningConsolidationModal({
  repertoireId,
  onClose,
  onConfirm,
}: {
  repertoireId: string;
  onClose: () => void;
  onConfirm: (groupKeys: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const areas = useAtomValue(trainingAreasAtom);
  const groups = useMemo(
    () => getOpeningConsolidationGroups(areas.openings, repertoireId),
    [areas.openings, repertoireId],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setSelected(groups.map((group) => group.key)), [groups]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm(selected);
      onClose();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened
      onClose={() => !busy && onClose()}
      title={t("OpeningConsolidation.Title", "Consolidate sections")}
      size="lg"
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
    >
      <Stack>
        <Alert color="blue" variant="light">
          {t(
            "OpeningConsolidation.Description",
            "Consolidation combines related imported sections into one section containing multiple lines. Onyx only suggests compatible groups recognized from numbered Chessable-style names; nothing changes until you confirm the selection.",
          )}
        </Alert>
        {error && <Alert color="red">{error}</Alert>}
        {groups.length === 0 ? (
          <Text c="dimmed">
            {t(
              "OpeningConsolidation.Empty",
              "No conservative consolidation groups were detected in this repertoire.",
            )}
          </Text>
        ) : (
          <Stack gap="xs">
            {groups.map((group) => (
              <Card key={group.key} withBorder padding="sm">
                <Checkbox
                  checked={selected.includes(group.key)}
                  disabled={busy}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.currentTarget.checked
                        ? [...current, group.key]
                        : current.filter((key) => key !== group.key),
                    )
                  }
                  label={
                    <div>
                      <Text fw={600}>{group.name}</Text>
                      <Text size="xs" c="dimmed">
                        {t(
                          "OpeningConsolidation.Counts",
                          "{{sections}} sections → {{lines}} lines",
                          {
                            sections: group.variantIds.length,
                            lines: group.lineCount,
                          },
                        )}
                      </Text>
                    </div>
                  }
                />
              </Card>
            ))}
          </Stack>
        )}
        <Text size="xs" c="dimmed">
          {t(
            "OpeningConsolidation.Progress",
            "Line identifiers and progress are preserved. Exact duplicate lines are combined and their recorded progress is accumulated.",
          )}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" disabled={busy} onClick={onClose}>
            {t("Common.Cancel", "Cancel")}
          </Button>
          <Button loading={busy} disabled={selected.length === 0} onClick={() => void confirm()}>
            {t("OpeningConsolidation.Confirm", "Consolidate selected groups")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
