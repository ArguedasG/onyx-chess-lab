import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useLoaderData } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { tabsAtom } from "@/state/atoms";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { previewOpeningTrainingSync } from "@/utils/openingTraining";
import { getTabFile, saveToFile, type Tab } from "@/utils/tabs";
import { TreeStateContext } from "../common/TreeStateContext";

function ConfirmChangesModal({
  opened,
  toggle,
  closeTab,
  tab,
}: {
  opened: boolean;
  toggle: () => void;
  closeTab: () => void;
  tab: Tab;
}) {
  const setTabs = useSetAtom(tabsAtom);
  const [trainingAreas, setTrainingAreas] = useAtom(trainingAreasAtom);
  const store = useContext(TreeStateContext)!;
  const { documentDir } = useLoaderData({ from: "/" });
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tabFile = getTabFile(tab);
  const isRepertoire = tabFile?.metadata.type === "repertoire";

  async function saveAndClose(updateTraining = false) {
    setSaving(true);
    setError(null);
    try {
      const state = store.getState();
      const gameNumber =
        tab.gameOrigin.kind === "file" || tab.gameOrigin.kind === "temp_file"
          ? tab.gameOrigin.gameNumber
          : 0;
      const preview =
        updateTraining && tabFile
          ? previewOpeningTrainingSync(
              trainingAreas.openings,
              tabFile.path,
              gameNumber,
              state.root,
              state.headers,
            )
          : null;
      const saved = await saveToFile({
        dir: documentDir,
        setCurrentTab: (update) =>
          setTabs((tabs) =>
            tabs.map((candidate) =>
              candidate.value === tab.value
                ? typeof update === "function"
                  ? update(candidate)
                  : update
                : candidate,
            ),
          ),
        tab,
        store,
        isUserSave: true,
      });
      if (saved) {
        if (preview) {
          setTrainingAreas((current) => ({ ...current, openings: preview.openings }));
        }
        closeTab();
        toggle();
      }
    } catch (error) {
      setError(String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      withCloseButton={false}
      opened={opened}
      onClose={() => !saving && toggle()}
      closeOnEscape={!saving}
      closeOnClickOutside={!saving}
    >
      <Stack>
        <div>
          <Text fz="lg" fw="bold" mb={10}>
            {isRepertoire
              ? t("OpeningEdit.UnsavedRepertoireChanges", "Unsaved repertoire changes")
              : t("Tabs.UnsavedChanges", "Unsaved changes")}
          </Text>
          <Text>
            {isRepertoire
              ? t(
                  "OpeningEdit.CloseDecisionDescription",
                  "Choose whether to discard the changes, save only the editable PGN, or also update the training lines.",
                )
              : t("Tabs.SaveBeforeClosing", "Do you want to save your changes before closing?")}
          </Text>
        </div>
        {error && (
          <Text c="red" size="sm">
            {t("Tabs.SaveFailed", "Could not save. The tab remains open.")} {error}
          </Text>
        )}

        <Group justify="right" wrap="wrap">
          <Button variant="subtle" disabled={saving} onClick={toggle}>
            {t("Common.Cancel", "Cancel")}
          </Button>
          <Button
            variant="default"
            disabled={saving}
            onClick={() => {
              closeTab();
              toggle();
            }}
          >
            {isRepertoire
              ? t("OpeningEdit.DiscardAndClose", "Discard and close")
              : t("Tabs.CloseWithoutSaving", "Close without saving")}
          </Button>
          {isRepertoire ? (
            <>
              <Button variant="default" loading={saving} onClick={() => void saveAndClose(false)}>
                {t("OpeningEdit.SavePgnOnly", "Save PGN only")}
              </Button>
              <Button loading={saving} onClick={() => void saveAndClose(true)}>
                {t("OpeningEdit.SaveAndUpdateTraining", "Save and update training")}
              </Button>
            </>
          ) : (
            <Button loading={saving} onClick={() => void saveAndClose()}>
              {t("Tabs.SaveAndClose", "Save and close")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

export default ConfirmChangesModal;
