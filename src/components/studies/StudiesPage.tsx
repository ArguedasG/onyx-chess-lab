import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconBookUpload,
  IconDots,
  IconDownload,
  IconEdit,
  IconFileImport,
  IconHistory,
  IconNotebook,
  IconClipboardText,
  IconPlayerPlay,
  IconPlus,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react";
import { useLoaderData, useNavigate } from "@tanstack/react-router";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { activeTabAtom, currentTabAtom, tabsAtom } from "@/state/atoms";
import { defaultPGN, parsePGN } from "@/utils/chess";
import {
  addStudyChapter,
  createStudy,
  deleteStudy,
  deleteStudyChapter,
  exportStudyChapterPgn,
  exportStudyPgn,
  loadStudyLibrary,
  moveStudy,
  moveStudyChapter,
  parseStudyLibraryBackup,
  permanentlyDeleteStudyTrashEntry,
  restoreStudyChapterRevision,
  restoreStudyTrashEntry,
  saveStudyLibrary,
  updateStudyChapter,
  updateStudyDetails,
  updateStudyLibrary,
  type Study,
  type StudyChapter,
  type StudyLibrary,
} from "@/utils/studies";
import { createTab } from "@/utils/tabs";
import { getGameName } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import StudyTrainingCopyModal from "./StudyTrainingCopyModal";
import { parseStudyPgnText, StudyPgnImportError } from "@/utils/studyImport";

type EditTarget =
  | { kind: "study"; id: string; name: string; description: string }
  | { kind: "chapter"; studyId: string; id: string; name: string };

export default function StudiesPage() {
  const { t } = useTranslation();
  const { documentDir } = useLoaderData({ from: "/studies" });
  const navigate = useNavigate();
  const currentTab = useAtomValue(currentTabAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const [library, setLibrary] = useState<StudyLibrary | null>(null);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [createOpened, setCreateOpened] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [trashOpened, setTrashOpened] = useState(false);
  const [historyChapter, setHistoryChapter] = useState<StudyChapter | null>(null);
  const [copyOpened, setCopyOpened] = useState(false);
  const [pasteOpened, setPasteOpened] = useState(false);
  const [pastedPgn, setPastedPgn] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<{ text: string; color: string } | null>(null);

  const selectedStudy = selectedStudyId ? library?.studies[selectedStudyId] : undefined;
  const selectedChapters = useMemo(
    () =>
      selectedStudy?.chapterOrder
        .filter((id) => selectedChapterIds.includes(id))
        .map((id) => selectedStudy.chapters[id])
        .filter((chapter): chapter is StudyChapter => Boolean(chapter)) ?? [],
    [selectedChapterIds, selectedStudy],
  );

  useEffect(() => {
    void loadStudyLibrary().then(({ library, recoveredFromBackup }) => {
      setLibrary(library);
      const origin = currentTab?.gameOrigin;
      setSelectedStudyId(
        origin?.kind === "study" && library.studies[origin.studyId]
          ? origin.studyId
          : (library.studyOrder[0] ?? null),
      );
      if (recoveredFromBackup) {
        setMessage({
          color: "yellow",
          text: t(
            "Studies.RecoveredBackup",
            "The main library could not be read. Onyx loaded its automatic recovery copy.",
          ),
        });
      }
      setBusy(false);
    });
  }, [currentTab?.gameOrigin, t]);

  useEffect(() => {
    setSelectedChapterIds([]);
  }, [selectedStudyId]);

  async function mutate(update: (current: StudyLibrary) => StudyLibrary) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await updateStudyLibrary(update);
      setLibrary(next);
      if (selectedStudyId && !next.studies[selectedStudyId]) {
        setSelectedStudyId(next.studyOrder[0] ?? null);
      }
      return next;
    } catch (error) {
      setMessage({ color: "red", text: String(error) });
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function createNewStudy() {
    if (!newName.trim()) return;
    const next = await mutate((current) => createStudy(current, newName, newDescription));
    const created = next.studyOrder.at(-1) ?? null;
    setSelectedStudyId(created);
    setNewName("");
    setNewDescription("");
    setCreateOpened(false);
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (editTarget.kind === "study") {
      await mutate((current) =>
        updateStudyDetails(current, editTarget.id, {
          name: editTarget.name,
          description: editTarget.description,
        }),
      );
    } else {
      await mutate((current) =>
        updateStudyChapter(current, editTarget.studyId, editTarget.id, {
          title: editTarget.name,
        }),
      );
    }
    setEditTarget(null);
  }

  async function addBlankChapter() {
    if (!selectedStudy) return;
    const title = t("Studies.NewChapter", "New chapter");
    const next = await mutate((current) =>
      addStudyChapter(current, selectedStudy.id, {
        title,
        pgn: defaultPGN(),
        source: { kind: "board", label: t("Studies.BlankChapter", "Blank chapter") },
      }),
    );
    const id = next.studies[selectedStudy.id]?.chapterOrder.at(-1);
    if (id)
      await openChapter(
        next.studies[selectedStudy.id],
        next.studies[selectedStudy.id].chapters[id],
      );
  }

  async function importPgn() {
    if (!selectedStudy) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: "PGN", extensions: ["pgn"] }],
    });
    if (typeof selected !== "string") return;
    setBusy(true);
    setMessage(null);
    try {
      const count = unwrap(await commands.countPgnGames(selected));
      if (count === 0) throw new Error(t("Studies.EmptyPgn", "The PGN contains no games."));
      const chapters: Array<{ title: string; pgn: string }> = [];
      for (let start = 0; start < count; start += 100) {
        const raws = unwrap(
          await commands.readGames(selected, start, Math.min(count - 1, start + 99)),
        );
        for (const [offset, pgn] of raws.entries()) {
          const tree = await parsePGN(pgn);
          const inferredTitle = getGameName(tree.headers);
          chapters.push({
            pgn,
            title:
              tree.headers.other?.ChapterName?.trim() ||
              (inferredTitle !== "Unknown"
                ? inferredTitle
                : `${t("Studies.Chapter", "Chapter")} ${start + offset + 1}`),
          });
        }
      }
      const next = await updateStudyLibrary((current) =>
        chapters.reduce(
          (result, chapter) =>
            addStudyChapter(result, selectedStudy.id, {
              title: chapter.title,
              pgn: chapter.pgn,
              source: { kind: "file", label: selected },
            }),
          current,
        ),
      );
      setLibrary(next);
      setMessage({
        color: "green",
        text: t("Studies.Imported", "Imported {{count}} chapters.", { count: chapters.length }),
      });
    } catch (error) {
      setMessage({ color: "red", text: String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function importPastedPgn() {
    if (!selectedStudy) return;
    setBusy(true);
    setPasteError("");
    try {
      const chapters = await parseStudyPgnText(pastedPgn);
      const next = await updateStudyLibrary((current) =>
        chapters.reduce(
          (result, chapter, index) =>
            addStudyChapter(result, selectedStudy.id, {
              pgn: chapter.pgn,
              title: chapter.generatedTitle
                ? `${t("Studies.Chapter", "Chapter")} ${index + 1}`
                : chapter.title,
              source: { kind: "file", label: t("Studies.PastedPgn", "Pasted PGN") },
            }),
          current,
        ),
      );
      setLibrary(next);
      setPastedPgn("");
      setPasteOpened(false);
      setMessage({
        color: "green",
        text: t("Studies.Imported", "Imported {{count}} chapters.", { count: chapters.length }),
      });
    } catch (error) {
      if (error instanceof StudyPgnImportError) {
        const key = {
          empty: "Studies.PasteEmpty",
          tooLarge: "Studies.PasteTooLarge",
          tooMany: "Studies.PasteTooMany",
          invalid: "Studies.PasteInvalid",
        }[error.code];
        const fallback = {
          empty: "Paste at least one PGN game.",
          tooLarge: "The pasted PGN is too large. Import it as a file instead.",
          tooMany: "The text contains too many games. Import it as a file instead.",
          invalid: "Game {{number}} is not valid PGN or contains no moves.",
        }[error.code];
        setPasteError(t(key, fallback, { number: error.recordNumber ?? 1 }));
      } else {
        setPasteError(t("Studies.PasteFailed", "The PGN text could not be imported."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function openChapter(study: Study, chapter: StudyChapter) {
    await createTab({
      tab: { name: chapter.title, type: "analysis", returnPath: "/studies" },
      pgn: chapter.pgn,
      gameOrigin: { kind: "study", studyId: study.id, chapterId: chapter.id },
      setTabs,
      setActiveTab,
    });
    await navigate({ to: "/" });
  }

  async function exportPgn(name: string, pgn: string) {
    const target = await save({
      defaultPath: `${documentDir}/${name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "study"}.pgn`,
      filters: [{ name: "PGN", extensions: ["pgn"] }],
    });
    if (!target) return;
    await writeTextFile(
      target.toLowerCase().endsWith(".pgn") ? target : `${target}.pgn`,
      `${pgn.trim()}\n`,
    );
    notifications.show({ color: "green", message: t("Studies.Exported", "PGN exported.") });
  }

  async function exportBackup() {
    if (!library) return;
    const target = await save({
      defaultPath: `${documentDir}/onyx-studies-backup.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!target) return;
    await writeTextFile(
      target.toLowerCase().endsWith(".json") ? target : `${target}.json`,
      JSON.stringify(library, null, 2),
    );
  }

  async function restoreBackup() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Onyx studies backup", extensions: ["json"] }],
    });
    if (typeof selected !== "string") return;
    const restored = parseStudyLibraryBackup(await readTextFile(selected));
    const confirmed = await ask(
      t(
        "Studies.RestoreBackupConfirm",
        "Replace the current study library with this backup? An automatic recovery copy of the current library will be retained.",
      ),
      { kind: "warning" },
    );
    if (!confirmed) return;
    await saveStudyLibrary(restored);
    setLibrary(restored);
    setSelectedStudyId(restored.studyOrder[0] ?? null);
  }

  if (!library) {
    return (
      <Container py="xl">
        <Text>
          {busy
            ? t("Common.Loading", "Loading…")
            : t("Studies.LoadFailed", "Could not load studies.")}
        </Text>
      </Container>
    );
  }

  return (
    <Container fluid h="100%" py="md">
      <Stack h="100%" gap="md">
        <Group justify="space-between">
          <div>
            <Title order={2}>{t("Studies.Title", "Studies")}</Title>
            <Text c="dimmed">
              {t("Studies.Intro", "Organize games and analyses as editable PGN chapters.")}
            </Text>
          </div>
          <Group>
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={exportBackup}
            >
              {t("Studies.Backup", "Backup")}
            </Button>
            <Button
              variant="default"
              leftSection={<IconRestore size={16} />}
              onClick={restoreBackup}
            >
              {t("Studies.RestoreBackup", "Restore backup")}
            </Button>
            <Button
              variant="default"
              leftSection={<IconTrash size={16} />}
              onClick={() => setTrashOpened(true)}
            >
              {t("Studies.Trash", "Trash")} ({library.trash.length})
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpened(true)}>
              {t("Studies.Create", "New study")}
            </Button>
          </Group>
        </Group>
        {message && <Alert color={message.color}>{message.text}</Alert>}

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md" style={{ flex: 1, minHeight: 0 }}>
          <Paper withBorder p="sm" style={{ minHeight: 0 }}>
            <Stack h="100%">
              <Text fw={600}>{t("Studies.Library", "Library")}</Text>
              <ScrollArea flex={1} offsetScrollbars>
                <Stack gap="xs">
                  {library.studyOrder.map((id, index) => {
                    const study = library.studies[id];
                    if (!study) return null;
                    return (
                      <Card
                        key={id}
                        withBorder
                        padding="sm"
                        bg={selectedStudyId === id ? "var(--mantine-color-blue-light)" : undefined}
                        onClick={() => setSelectedStudyId(id)}
                        style={{ cursor: "pointer" }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <div style={{ minWidth: 0 }}>
                            <Text fw={600} truncate>
                              {study.name}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {t("Studies.ChapterCount", "{{count}} chapters", {
                                count: study.chapterOrder.length,
                              })}
                            </Text>
                          </div>
                          <Menu withinPortal>
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconEdit size={14} />}
                                onClick={() =>
                                  setEditTarget({
                                    kind: "study",
                                    id,
                                    name: study.name,
                                    description: study.description,
                                  })
                                }
                              >
                                {t("Common.Edit", "Edit")}
                              </Menu.Item>
                              <Menu.Item
                                disabled={index === 0}
                                leftSection={<IconArrowUp size={14} />}
                                onClick={() => void mutate((current) => moveStudy(current, id, -1))}
                              >
                                {t("Studies.MoveUp", "Move up")}
                              </Menu.Item>
                              <Menu.Item
                                disabled={index === library.studyOrder.length - 1}
                                leftSection={<IconArrowDown size={14} />}
                                onClick={() => void mutate((current) => moveStudy(current, id, 1))}
                              >
                                {t("Studies.MoveDown", "Move down")}
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconDownload size={14} />}
                                onClick={() => void exportPgn(study.name, exportStudyPgn(study))}
                              >
                                {t("Studies.ExportStudy", "Export study PGN")}
                              </Menu.Item>
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={14} />}
                                onClick={async () => {
                                  if (
                                    await ask(
                                      t(
                                        "Studies.DeleteStudyConfirm",
                                        "Move this study and all its chapters to the trash?",
                                      ),
                                      { kind: "warning" },
                                    )
                                  ) {
                                    await mutate((current) => deleteStudy(current, id));
                                  }
                                }}
                              >
                                {t("Common.Delete", "Delete")}
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Card>
                    );
                  })}
                  {library.studyOrder.length === 0 && (
                    <Text c="dimmed">
                      {t("Studies.Empty", "Create your first study to start collecting analyses.")}
                    </Text>
                  )}
                </Stack>
              </ScrollArea>
            </Stack>
          </Paper>

          <Paper withBorder p="sm" style={{ minHeight: 0 }}>
            <Stack h="100%">
              <Group justify="space-between">
                <Text fw={600}>{selectedStudy?.name ?? t("Studies.Chapters", "Chapters")}</Text>
                {selectedStudy && (
                  <Badge variant="light">{selectedStudy.chapterOrder.length}</Badge>
                )}
              </Group>
              {selectedStudy && (
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconPlus size={14} />}
                    onClick={addBlankChapter}
                  >
                    {t("Studies.Blank", "Blank")}
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconFileImport size={14} />}
                    onClick={importPgn}
                  >
                    {t("Studies.ImportPgn", "Import PGN")}
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconClipboardText size={14} />}
                    onClick={() => {
                      setPasteError("");
                      setPasteOpened(true);
                    }}
                  >
                    {t("Studies.PastePgn", "Paste PGN")}
                  </Button>
                </Group>
              )}
              <ScrollArea flex={1} offsetScrollbars>
                <Stack gap="xs">
                  {selectedStudy?.chapterOrder.map((id, index) => {
                    const chapter = selectedStudy.chapters[id];
                    if (!chapter) return null;
                    const checked = selectedChapterIds.includes(id);
                    return (
                      <Card key={id} withBorder padding="sm">
                        <Group justify="space-between" wrap="nowrap">
                          <Checkbox
                            checked={checked}
                            onChange={(event) =>
                              setSelectedChapterIds((current) =>
                                event.currentTarget.checked
                                  ? [...current, id]
                                  : current.filter((candidate) => candidate !== id),
                              )
                            }
                            aria-label={t("Studies.SelectChapter", "Select chapter")}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text fw={500} truncate>
                              {chapter.title}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {new Date(chapter.updatedAt).toLocaleString()}
                            </Text>
                          </div>
                          <Menu withinPortal>
                            <Menu.Target>
                              <ActionIcon variant="subtle">
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconPlayerPlay size={14} />}
                                onClick={() => void openChapter(selectedStudy, chapter)}
                              >
                                {t("Studies.OpenChapter", "Open chapter")}
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconEdit size={14} />}
                                onClick={() =>
                                  setEditTarget({
                                    kind: "chapter",
                                    studyId: selectedStudy.id,
                                    id,
                                    name: chapter.title,
                                  })
                                }
                              >
                                {t("Common.Rename", "Rename")}
                              </Menu.Item>
                              <Menu.Item
                                disabled={index === 0}
                                leftSection={<IconArrowUp size={14} />}
                                onClick={() =>
                                  void mutate((current) =>
                                    moveStudyChapter(current, selectedStudy.id, id, -1),
                                  )
                                }
                              >
                                {t("Studies.MoveUp", "Move up")}
                              </Menu.Item>
                              <Menu.Item
                                disabled={index === selectedStudy.chapterOrder.length - 1}
                                leftSection={<IconArrowDown size={14} />}
                                onClick={() =>
                                  void mutate((current) =>
                                    moveStudyChapter(current, selectedStudy.id, id, 1),
                                  )
                                }
                              >
                                {t("Studies.MoveDown", "Move down")}
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconHistory size={14} />}
                                disabled={chapter.revisions.length === 0}
                                onClick={() => setHistoryChapter(chapter)}
                              >
                                {t("Studies.History", "History")}
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconDownload size={14} />}
                                onClick={() =>
                                  void exportPgn(
                                    chapter.title,
                                    exportStudyChapterPgn(selectedStudy, chapter),
                                  )
                                }
                              >
                                {t("Studies.ExportChapter", "Export chapter PGN")}
                              </Menu.Item>
                              <Menu.Item
                                color="red"
                                leftSection={<IconTrash size={14} />}
                                onClick={() =>
                                  void mutate((current) =>
                                    deleteStudyChapter(current, selectedStudy.id, id),
                                  )
                                }
                              >
                                {t("Common.Delete", "Delete")}
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Card>
                    );
                  })}
                </Stack>
              </ScrollArea>
            </Stack>
          </Paper>

          <Paper withBorder p="lg" style={{ minHeight: 0 }}>
            <Stack>
              <IconNotebook size={42} color="var(--mantine-color-dimmed)" />
              <Title order={3}>
                {selectedStudy?.name ?? t("Studies.NoStudy", "No study selected")}
              </Title>
              <Text c="dimmed">
                {selectedStudy?.description ||
                  t(
                    "Studies.Scope",
                    "Each chapter is an independent, editable PGN tree. Copies sent to Training never modify the study.",
                  )}
              </Text>
              {selectedStudy && (
                <>
                  <Button
                    leftSection={<IconBookUpload size={16} />}
                    disabled={selectedChapters.length === 0}
                    onClick={() => setCopyOpened(true)}
                  >
                    {t("Studies.LoadTrainingCopy", "Create a training copy")} (
                    {selectedChapters.length})
                  </Button>
                  <Text size="sm" c="dimmed">
                    {t(
                      "Studies.CopyHint",
                      "Select one or more chapters. Tactics and Endgames require position review; Openings copies complete PGN trees.",
                    )}
                  </Text>
                </>
              )}
            </Stack>
          </Paper>
        </SimpleGrid>
      </Stack>

      <Modal
        opened={pasteOpened}
        onClose={() => !busy && setPasteOpened(false)}
        title={t("Studies.PastePgn", "Paste PGN")}
        size="lg"
      >
        <Stack>
          <Text c="dimmed" size="sm">
            {t(
              "Studies.PastePgnHint",
              "Paste one or more complete PGN games. Each game becomes a chapter in the selected study.",
            )}
          </Text>
          {pasteError && <Alert color="red">{pasteError}</Alert>}
          <Textarea
            value={pastedPgn}
            onChange={(event) => {
              setPastedPgn(event.currentTarget.value);
              if (pasteError) setPasteError("");
            }}
            autosize
            minRows={12}
            maxRows={24}
            placeholder={'[Event "Casual game"]\n...\n\n1. e4 e5 2. Nf3 *'}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" disabled={busy} onClick={() => setPasteOpened(false)}>
              {t("Common.Cancel", "Cancel")}
            </Button>
            <Button loading={busy} disabled={!pastedPgn.trim()} onClick={importPastedPgn}>
              {t("Studies.ImportPastedPgn", "Import pasted PGN")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
        title={t("Studies.Create", "New study")}
      >
        <Stack>
          <TextInput
            label={t("Studies.Name", "Name")}
            value={newName}
            onChange={(event) => setNewName(event.currentTarget.value)}
          />
          <Textarea
            label={t("Studies.Description", "Description")}
            value={newDescription}
            onChange={(event) => setNewDescription(event.currentTarget.value)}
          />
          <Button disabled={!newName.trim()} onClick={createNewStudy}>
            {t("Common.Create", "Create")}
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={t("Common.Edit", "Edit")}
      >
        {editTarget && (
          <Stack>
            <TextInput
              label={t("Studies.Name", "Name")}
              value={editTarget.name}
              onChange={(event) =>
                setEditTarget({ ...editTarget, name: event.currentTarget.value })
              }
            />
            {editTarget.kind === "study" && (
              <Textarea
                label={t("Studies.Description", "Description")}
                value={editTarget.description}
                onChange={(event) =>
                  setEditTarget({ ...editTarget, description: event.currentTarget.value })
                }
              />
            )}
            <Button disabled={!editTarget.name.trim()} onClick={saveEdit}>
              {t("Common.Save", "Save")}
            </Button>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={trashOpened}
        onClose={() => setTrashOpened(false)}
        title={t("Studies.Trash", "Trash")}
        size="lg"
      >
        <Stack>
          {library.trash.map((entry) => (
            <Card key={entry.id} withBorder>
              <Group justify="space-between">
                <div>
                  <Text fw={500}>
                    {entry.kind === "study"
                      ? entry.study.name
                      : `${entry.studyName} · ${entry.chapter.title}`}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {new Date(entry.deletedAt).toLocaleString()}
                  </Text>
                </div>
                <Group>
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconRestore size={14} />}
                    onClick={() =>
                      void mutate((current) => restoreStudyTrashEntry(current, entry.id))
                    }
                  >
                    {t("Common.Restore", "Restore")}
                  </Button>
                  <Button
                    size="xs"
                    color="red"
                    variant="subtle"
                    onClick={() =>
                      void mutate((current) => permanentlyDeleteStudyTrashEntry(current, entry.id))
                    }
                  >
                    {t("Studies.DeletePermanently", "Delete permanently")}
                  </Button>
                </Group>
              </Group>
            </Card>
          ))}
          {library.trash.length === 0 && (
            <Text c="dimmed">{t("Studies.TrashEmpty", "The trash is empty.")}</Text>
          )}
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(historyChapter)}
        onClose={() => setHistoryChapter(null)}
        title={t("Studies.History", "History")}
      >
        <Stack>
          {historyChapter?.revisions.map((revision) => (
            <Group key={revision.id} justify="space-between">
              <Text size="sm">{new Date(revision.savedAt).toLocaleString()}</Text>
              <Button
                size="xs"
                variant="default"
                onClick={async () => {
                  if (!selectedStudy || !historyChapter) return;
                  await mutate((current) =>
                    restoreStudyChapterRevision(
                      current,
                      selectedStudy.id,
                      historyChapter.id,
                      revision.id,
                    ),
                  );
                  setHistoryChapter(null);
                }}
              >
                {t("Common.Restore", "Restore")}
              </Button>
            </Group>
          ))}
        </Stack>
      </Modal>

      {copyOpened && selectedStudy && (
        <StudyTrainingCopyModal
          study={selectedStudy}
          chapters={selectedChapters}
          documentDir={documentDir}
          onClose={() => setCopyOpened(false)}
        />
      )}
    </Container>
  );
}
