import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBook2,
  IconChevronDown,
  IconChess,
  IconEdit,
  IconPuzzle,
  IconSchool,
  IconTarget,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { pendingPgnImportAtom, type PendingPgnImportTarget } from "@/state/pendingPgnImport";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { openFile } from "@/utils/files";
import { capitalize } from "@/utils/format";
import { findPgnUsages, type PgnUsage } from "@/utils/pgnUsage";
import { loadStudyLibrary, type StudyLibrary } from "@/utils/studies";
import { parseStudyPgnText, StudyPgnImportError } from "@/utils/studyImport";
import { unwrap } from "@/utils/unwrap";
import GamePreview from "../databases/GamePreview";
import GameSelector from "../panels/info/GameSelector";
import AddToStudyModal from "../studies/AddToStudyModal";
import RepertoireAdditionModal from "../training/RepertoireAdditionModal";
import type { FileMetadata } from "./file";

type Confirmation = { message: string; run: () => void };

function FileCard({
  selected,
  games,
  setGames,
  toggleEditModal,
}: {
  selected: FileMetadata;
  games: Map<number, string>;
  setGames: React.Dispatch<React.SetStateAction<Map<number, string>>>;
  toggleEditModal: () => void;
}) {
  const { t } = useTranslation();

  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setPendingImport = useSetAtom(pendingPgnImportAtom);
  const areas = useAtomValue(trainingAreasAtom);
  const navigate = useNavigate();

  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [studies, setStudies] = useState<StudyLibrary | null>(null);
  const [studyGames, setStudyGames] = useState<{ title: string; pgn: string }[] | null>(null);
  const [addingToRepertoire, setAddingToRepertoire] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    setPage(0);
  }, [selected]);

  useEffect(() => {
    async function loadGames() {
      const data = unwrap(await commands.readGames(selected.path, page, page));

      setSelectedGame(data[0]);
    }
    loadGames();
  }, [selected, page]);

  // Reloaded after adding chapters so the "linked to" badges stay current.
  useEffect(() => {
    if (studyGames) return;
    let cancelled = false;
    void loadStudyLibrary()
      .then(({ library }) => !cancelled && setStudies(library))
      .catch(() => !cancelled && setStudies(null));
    return () => {
      cancelled = true;
    };
  }, [selected.path, studyGames]);

  const usages = useMemo(
    () => findPgnUsages(selected.path, areas, studies),
    [selected.path, areas, studies],
  );
  const hasRepertoires = Object.keys(areas.openings.repertoires).length > 0;

  async function openGame() {
    await openFile(selected, setTabs, setActiveTab, {
      gameNumber: page,
      pgn: selectedGame || "",
    });
    navigate({ to: "/" });
  }

  /** Runs `action` directly, or after a warning when the file is already used that way. */
  function confirmIf(related: PgnUsage[], message: string, action: () => void) {
    if (related.length === 0) action();
    else setConfirmation({ message, run: action });
  }

  function usageLabel(usage: PgnUsage) {
    switch (usage.kind) {
      case "repertoire":
        return {
          editable: t("Files.Usage.RepertoireEditable", "Repertoire · {{name}} (editable copy)", {
            name: usage.name,
          }),
          source: t("Files.Usage.RepertoireSource", "Repertoire · {{name}} (original)", {
            name: usage.name,
          }),
          imported: t("Files.Usage.RepertoireImported", "Repertoire · {{name}} (imported)", {
            name: usage.name,
          }),
        }[usage.role];
      case "tactics":
        return t("Files.Usage.Tactics", "Tactics · {{name}}", { name: usage.name });
      case "study":
        return t("Files.Usage.Study", "Study · {{name}} ({{count}} chapters)", {
          name: usage.name,
          count: usage.chapters,
        });
    }
  }

  function openUsage(usage: PgnUsage) {
    if (usage.kind === "repertoire") {
      navigate({ to: "/training/openings/$repertoireId", params: { repertoireId: usage.id } });
    } else if (usage.kind === "tactics") {
      navigate({ to: "/training/tactics" });
    } else {
      navigate({ to: "/studies" });
    }
  }

  async function addToStudy() {
    try {
      const chapters = await parseStudyPgnText(await readTextFile(selected.path));
      setStudyGames(
        chapters.map((chapter, index) => ({
          title: chapter.generatedTitle
            ? `${t("Studies.Chapter", "Chapter")} ${index + 1}`
            : chapter.title,
          pgn: chapter.pgn,
        })),
      );
    } catch (error) {
      const message =
        error instanceof StudyPgnImportError
          ? {
              empty: t("Files.Study.Empty", "The file has no games."),
              tooLarge: t("Files.Study.TooLarge", "The file is too large to turn into a study."),
              tooMany: t(
                "Files.Study.TooMany",
                "The file has more than 500 games; split it before adding it to a study.",
              ),
              invalid: t(
                "Files.Study.Invalid",
                "Game {{number}} is not valid PGN or contains no moves.",
                { number: error.recordNumber ?? 1 },
              ),
            }[error.code]
          : String(error);
      notifications.show({ color: "red", message });
    }
  }

  function startTrainingImport(target: PendingPgnImportTarget) {
    setPendingImport({ target, path: selected.path });
    if (target === "openings") navigate({ to: "/training/openings/manage", hash: "import" });
    else if (target === "tactics") navigate({ to: "/training/tactics" });
    else navigate({ to: "/training/endgames" });
  }

  const repertoireUsages = usages.filter((usage) => usage.kind === "repertoire");
  const tacticsUsages = usages.filter((usage) => usage.kind === "tactics");
  const studyUsages = usages.filter((usage) => usage.kind === "study");
  const listNames = (items: PgnUsage[]) => items.map((usage) => `“${usage.name}”`).join(", ");

  return (
    <Stack h="100%">
      {studyGames && (
        <AddToStudyModal
          opened
          onClose={() => setStudyGames(null)}
          pgn=""
          suggestedTitle={selected.name}
          sourceLabel={selected.path}
          sourceKind="file"
          games={studyGames}
        />
      )}
      {addingToRepertoire && (
        <RepertoireAdditionModal
          initialPath={selected.path}
          onClose={() => setAddingToRepertoire(false)}
        />
      )}
      <Modal
        opened={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={t("Files.Usage.ConfirmTitle", "This PGN is already in use")}
      >
        <Stack>
          <Text size="sm">{confirmation?.message}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmation(null)}>
              {t("Common.Cancel")}
            </Button>
            <Button
              onClick={() => {
                confirmation?.run();
                setConfirmation(null);
              }}
            >
              {t("Common.Continue", "Continue")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Stack align="center" gap="xs">
        <Text ta="center" fz="xl" fw="bold">
          {selected?.name}
        </Text>
        <Badge>{t(`Files.FileType.${capitalize(selected.metadata.type)}`)}</Badge>
        {usages.length > 0 && (
          <Group gap={6} justify="center" px="md">
            <Text size="xs" c="dimmed">
              {t("Files.Usage.LinkedTo", "Used in:")}
            </Text>
            {usages.map((usage) => (
              <Tooltip key={`${usage.kind}-${usage.id}`} label={t("Files.Usage.Go", "Go there")}>
                <Badge
                  component="button"
                  variant="light"
                  color={
                    usage.kind === "repertoire"
                      ? "blue"
                      : usage.kind === "tactics"
                        ? "orange"
                        : "grape"
                  }
                  style={{ cursor: "pointer", textTransform: "none" }}
                  onClick={() => openUsage(usage)}
                >
                  {usageLabel(usage)}
                </Badge>
              </Tooltip>
            ))}
          </Group>
        )}
      </Stack>
      <Divider />

      <Group justify="space-between" px="xs" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconZoomCheck size={16} />}
            onClick={openGame}
          >
            {t("Common.Open")}
          </Button>
          <Menu position="bottom-start" withinPortal>
            <Menu.Target>
              <Button size="xs" variant="default" rightSection={<IconChevronDown size={14} />}>
                {t("Files.UseIn", "Use in…")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t("Files.UseIn.AddTo", "Add to")}</Menu.Label>
              <Menu.Item
                leftSection={<IconSchool size={16} />}
                onClick={() =>
                  confirmIf(
                    studyUsages,
                    t(
                      "Files.Usage.StudyWarning",
                      "Chapters from this PGN are already in {{names}}. Adding it again creates duplicate chapters.",
                      { names: listNames(studyUsages) },
                    ),
                    () => void addToStudy(),
                  )
                }
              >
                {t("Files.UseIn.Study", "A study (one chapter per game)")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconBook2 size={16} />}
                disabled={!hasRepertoires}
                onClick={() => setAddingToRepertoire(true)}
              >
                {t("Files.UseIn.Repertoire", "An existing repertoire")}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Label>{t("Files.UseIn.Create", "Create from this PGN")}</Menu.Label>
              <Menu.Item
                leftSection={<IconChess size={16} />}
                onClick={() =>
                  confirmIf(
                    repertoireUsages,
                    t(
                      "Files.Usage.RepertoireWarning",
                      "This PGN is already part of {{names}}. A new repertoire would train the same lines separately.",
                      { names: listNames(repertoireUsages) },
                    ),
                    () => startTrainingImport("openings"),
                  )
                }
              >
                {t("Files.UseIn.NewRepertoire", "New repertoire")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconTarget size={16} />}
                onClick={() =>
                  confirmIf(
                    tacticsUsages,
                    t(
                      "Files.Usage.TacticsWarning",
                      "This PGN is already the tactics set {{names}}. A new set would start its progress from zero.",
                      { names: listNames(tacticsUsages) },
                    ),
                    () => startTrainingImport("tactics"),
                  )
                }
              >
                {t("Files.UseIn.NewTactics", "New tactics set")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconPuzzle size={16} />}
                onClick={() => startTrainingImport("endgames")}
              >
                {t("Files.UseIn.NewEndgames", "New endgame set (FEN per game)")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Tooltip label={t("Files.EditMetadata")}>
            <ActionIcon size="md" variant="subtle" onClick={() => toggleEditModal()}>
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Text c="dimmed" size="sm">
          {selected?.numGames} {t("Common.Games")}
        </Text>
      </Group>

      {selectedGame && (
        <>
          <Box h={0} flex={1}>
            <Divider />
            <GameSelector
              setGames={setGames}
              games={games}
              activePage={page}
              path={selected.path}
              setPage={setPage}
              total={selected.numGames}
            />
            <Divider />
          </Box>
          <Box h="55%" px="xs" pb="xs">
            <GamePreview pgn={selectedGame} />
          </Box>
        </>
      )}
    </Stack>
  );
}

export default FileCard;
