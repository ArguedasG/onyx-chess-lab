import { Alert, Button, Group, Modal, Select, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addStudyChapter,
  createStudy,
  loadStudyLibrary,
  updateStudyLibrary,
  type StudyLibrary,
} from "@/utils/studies";

export default function AddToStudyModal({
  opened,
  onClose,
  pgn,
  suggestedTitle,
  sourceLabel,
}: {
  opened: boolean;
  onClose: () => void;
  pgn: string;
  suggestedTitle: string;
  sourceLabel: string;
}) {
  const { t } = useTranslation();
  const [library, setLibrary] = useState<StudyLibrary | null>(null);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [title, setTitle] = useState(suggestedTitle);
  const [newStudyName, setNewStudyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!opened) return;
    setTitle(suggestedTitle);
    setError("");
    void loadStudyLibrary().then(({ library }) => {
      setLibrary(library);
      setStudyId((current) =>
        current && library.studies[current] ? current : (library.studyOrder[0] ?? null),
      );
    });
  }, [opened, suggestedTitle]);

  async function createTargetStudy() {
    const name = newStudyName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      let createdId = "";
      const next = await updateStudyLibrary((current) => {
        const before = new Set(current.studyOrder);
        const updated = createStudy(current, name);
        createdId = updated.studyOrder.find((id) => !before.has(id)) ?? "";
        return updated;
      });
      setLibrary(next);
      setStudyId(createdId);
      setNewStudyName("");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!studyId || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const next = await updateStudyLibrary((current) =>
        addStudyChapter(current, studyId, {
          title,
          pgn,
          source: { kind: "board", label: sourceLabel },
        }),
      );
      setLibrary(next);
      notifications.show({
        color: "green",
        message: t("Studies.Added", "The chapter was added to the study."),
      });
      onClose();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={() => !busy && onClose()}
      title={t("Studies.AddCurrent", "Add current game to a study")}
    >
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        <Select
          label={t("Studies.Study", "Study")}
          data={(library?.studyOrder ?? []).flatMap((id) => {
            const study = library?.studies[id];
            return study ? [{ value: id, label: study.name }] : [];
          })}
          value={studyId}
          onChange={setStudyId}
          disabled={busy}
          placeholder={t("Studies.SelectStudy", "Select a study")}
        />
        <TextInput
          label={t("Studies.ChapterName", "Chapter name")}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          disabled={busy}
        />
        <Group align="end" grow>
          <TextInput
            label={t("Studies.NewStudy", "New study")}
            value={newStudyName}
            onChange={(event) => setNewStudyName(event.currentTarget.value)}
            disabled={busy}
          />
          <Button variant="default" disabled={!newStudyName.trim()} onClick={createTargetStudy}>
            {t("Common.Create", "Create")}
          </Button>
        </Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            {t("Common.Cancel", "Cancel")}
          </Button>
          <Button loading={busy} disabled={!studyId || !title.trim()} onClick={add}>
            {t("Studies.AddChapter", "Add chapter")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
