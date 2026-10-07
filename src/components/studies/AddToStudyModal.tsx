import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
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
  games,
  zIndex,
}: {
  opened: boolean;
  onClose: () => void;
  pgn: string;
  suggestedTitle: string;
  sourceLabel: string;
  /** Adds each game as its own chapter instead of `pgn` under the chosen title. */
  games?: { title: string; pgn: string }[];
  zIndex?: number;
}) {
  const { t } = useTranslation();
  const [library, setLibrary] = useState<StudyLibrary | null>(null);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [title, setTitle] = useState(suggestedTitle);
  const [newStudyName, setNewStudyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const multiple = games !== undefined;

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
    if (!studyId || (!multiple && !title.trim())) return;
    setBusy(true);
    setError("");
    try {
      const chapters = games ?? [{ title, pgn }];
      const next = await updateStudyLibrary((current) =>
        chapters.reduce(
          (library, chapter) =>
            addStudyChapter(library, studyId, {
              title: chapter.title,
              pgn: chapter.pgn,
              source: { kind: "board", label: sourceLabel },
            }),
          current,
        ),
      );
      setLibrary(next);
      notifications.show({
        color: "green",
        message: multiple
          ? t("Studies.AddedMany", "{{count}} chapters were added to the study.", {
              count: chapters.length,
            })
          : t("Studies.Added", "The chapter was added to the study."),
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
      title={
        multiple
          ? t("Studies.AddGames", "Add games to a study")
          : t("Studies.AddCurrent", "Add current game to a study")
      }
      zIndex={zIndex}
    >
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        <Select
          comboboxProps={{ zIndex: zIndex === undefined ? undefined : zIndex + 1 }}
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
        {multiple ? (
          <Text size="sm" c="dimmed">
            {t("Studies.AddGames.Desc", "Each game becomes its own chapter ({{count}}).", {
              count: games.length,
            })}
          </Text>
        ) : (
          <TextInput
            label={t("Studies.ChapterName", "Chapter name")}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            disabled={busy}
          />
        )}
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
          <Button
            loading={busy}
            disabled={!studyId || (multiple ? games.length === 0 : !title.trim())}
            onClick={add}
          >
            {multiple
              ? t("Studies.AddChapters", "Add chapters")
              : t("Studies.AddChapter", "Add chapter")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
