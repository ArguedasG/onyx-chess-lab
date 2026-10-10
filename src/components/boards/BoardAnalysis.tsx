import { Alert, Button, Group, Modal, Paper, Portal, Stack, Tabs, Text } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconDatabase,
  IconInfoCircle,
  IconNotes,
  IconTargetArrow,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useLoaderData } from "@tanstack/react-router";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Piece } from "chessops";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { commands } from "@/bindings";
import {
  allEnabledAtom,
  activeTabAtom,
  autoSaveAtom,
  currentAnalysisTabAtom,
  currentPracticeTabAtom,
  currentReportModalOpenAtom,
  currentTabAtom,
  currentTabSelectedAtom,
  currentThreatAtom,
  enableAllAtom,
  practiceStateAtom,
  tabsAtom,
} from "@/state/atoms";
import { keyMapAtom } from "@/state/keybinds";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { defaultPGN, parsePGN } from "@/utils/chess";
import { buildModelGameSourcePgn } from "@/utils/modelGame";
import {
  previewOpeningTrainingSync,
  type OpeningTrainingSyncPreview,
} from "@/utils/openingTraining";
import { createTab, getTabFile, saveToFile } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import DetachedEval from "../common/DetachedEval";
import GameNotation from "../common/GameNotation";
import MoveControls from "../common/MoveControls";
import { TreeStateContext } from "../common/TreeStateContext";
import AnalysisPanel from "../panels/analysis/AnalysisPanel";
import AnnotationPanel from "../panels/annotation/AnnotationPanel";
import DatabasePanel from "../panels/database/DatabasePanel";
import InfoPanel from "../panels/info/InfoPanel";
import PracticePanel from "../panels/practice/PracticePanel";
import AnnotationSymbolHotkeys from "./AnnotationSymbolHotkeys";
import Board from "./Board";
import BoardControls from "./BoardControls";
import EditingCard from "./EditingCard";
import { PanelHeader, PanelTitle } from "../tabs/RightColumn";
import EvalListener from "./EvalListener";

function BoardAnalysis() {
  const { t } = useTranslation();

  const [editingMode, toggleEditingMode] = useToggle();
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const tabFile = getTabFile(currentTab);
  const isRepertoire = tabFile?.metadata.type === "repertoire";
  const hasPersistentOrigin = currentTab?.gameOrigin.kind !== "none";
  const autoSave = useAtomValue(autoSaveAtom);
  const { documentDir } = useLoaderData({ from: "/" });
  const boardRef = useRef(null);

  const store = useContext(TreeStateContext)!;

  const dirty = useStore(store, (s) => s.dirty);
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const position = useStore(store, (s) => s.position);
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const [trainingAreas, setTrainingAreas] = useAtom(trainingAreasAtom);
  const [pendingTrainingSync, setPendingTrainingSync] = useState<OpeningTrainingSyncPreview | null>(
    null,
  );
  const [savingRepertoire, setSavingRepertoire] = useState(false);

  const reset = useStore(store, (s) => s.reset);
  const clearShapes = useStore(store, (s) => s.clearShapes);
  const setAnnotation = useStore(store, (s) => s.setAnnotation);

  const getRepertoirePreview = useCallback(() => {
    if (!isRepertoire || !currentTab || !tabFile) return null;
    const gameNumber =
      currentTab.gameOrigin.kind === "file" || currentTab.gameOrigin.kind === "temp_file"
        ? currentTab.gameOrigin.gameNumber
        : 0;
    const state = store.getState();
    return previewOpeningTrainingSync(
      trainingAreas.openings,
      tabFile.path,
      gameNumber,
      state.root,
      state.headers,
    );
  }, [currentTab, isRepertoire, store, tabFile, trainingAreas.openings]);

  const saveFile = useCallback(async () => {
    await saveToFile({
      dir: documentDir,
      setCurrentTab,
      tab: currentTab,
      store,
    });
  }, [setCurrentTab, currentTab, documentDir, store]);

  const saveRepertoirePgnOnly = useCallback(async () => {
    setSavingRepertoire(true);
    try {
      const saved = await saveToFile({
        dir: documentDir,
        setCurrentTab,
        tab: currentTab,
        store,
        isUserSave: true,
      });
      if (!saved) return false;
      notifications.show({
        color: "blue",
        message: t(
          "OpeningEdit.TrainingUnchanged",
          "The PGN was saved and training was left unchanged.",
        ),
      });
      return true;
    } catch (error) {
      notifications.show({ color: "red", message: String(error) });
      return false;
    } finally {
      setSavingRepertoire(false);
    }
  }, [currentTab, documentDir, setCurrentTab, store, t]);

  const saveRepertoireAndTraining = useCallback(
    async (preview = getRepertoirePreview()) => {
      if (!preview) return false;
      setSavingRepertoire(true);
      try {
        const saved = await saveToFile({
          dir: documentDir,
          setCurrentTab,
          tab: currentTab,
          store,
          isUserSave: true,
        });
        if (!saved) return false;
        setTrainingAreas((current) => ({ ...current, openings: preview.openings }));
        notifications.show({
          color: "green",
          message: t("OpeningEdit.TrainingUpdated", "The repertoire training lines were updated."),
        });
        return true;
      } catch (error) {
        notifications.show({ color: "red", message: String(error) });
        return false;
      } finally {
        setSavingRepertoire(false);
      }
    },
    [currentTab, documentDir, getRepertoirePreview, setCurrentTab, setTrainingAreas, store, t],
  );

  const discardRepertoireChanges = useCallback(async () => {
    if (!tabFile || !currentTab) return;
    setSavingRepertoire(true);
    try {
      const gameNumber =
        currentTab.gameOrigin.kind === "file" || currentTab.gameOrigin.kind === "temp_file"
          ? currentTab.gameOrigin.gameNumber
          : 0;
      const records = unwrap(await commands.readGames(tabFile.path, gameNumber, gameNumber));
      if (!records[0]) throw new Error(t("OpeningEdit.ReloadFailed", "Could not reload the PGN."));
      store.getState().setState(await parsePGN(records[0]));
      setPendingTrainingSync(null);
      notifications.show({
        color: "gray",
        message: t("OpeningEdit.ChangesDiscarded", "The unsaved changes were discarded."),
      });
    } catch (error) {
      notifications.show({ color: "red", message: String(error) });
    } finally {
      setSavingRepertoire(false);
    }
  }, [currentTab, store, t, tabFile]);

  const userSaveFile = useCallback(async () => {
    if (isRepertoire) {
      const preview = getRepertoirePreview();
      if (preview) setPendingTrainingSync(preview);
      return;
    }
    try {
      const saved = await saveToFile({
        dir: documentDir,
        setCurrentTab,
        tab: currentTab,
        store,
        isUserSave: true,
      });
      if (!saved) return;
      notifications.show({ color: "green", message: t("Pgn.SaveSuccess") });
    } catch (error) {
      notifications.show({ color: "red", message: String(error) });
    }
  }, [isRepertoire, getRepertoirePreview, setCurrentTab, currentTab, documentDir, store, t]);

  const generateModelGameFromPosition = useCallback(async () => {
    const pgn = buildModelGameSourcePgn(root, headers, position);
    await createTab({
      tab: {
        name: t("ModelGame.Title", "Model Game Generator"),
        type: "generator",
      },
      setTabs,
      setActiveTab,
      pgn,
      // The copied line ends at the selected move; open the generator on that position.
      position: position.map(() => 0),
    });
  }, [headers, position, root, setActiveTab, setTabs, t]);
  useEffect(() => {
    if (hasPersistentOrigin && autoSave && dirty && !isRepertoire) {
      saveFile();
    }
  }, [hasPersistentOrigin, saveFile, autoSave, dirty, isRepertoire]);

  const addGame = useCallback(() => {
    if (!tabFile) return;
    setCurrentTab((prev) => {
      if (prev.gameOrigin.kind !== "file" && prev.gameOrigin.kind !== "temp_file") {
        return prev;
      }
      return {
        ...prev,
        gameOrigin: {
          ...prev.gameOrigin,
          gameNumber: prev.gameOrigin.file.numGames,
          file: {
            ...prev.gameOrigin.file,
            numGames: prev.gameOrigin.file.numGames + 1,
          },
        },
      };
    });
    reset();
    writeTextFile(tabFile.path, `\n\n${defaultPGN()}\n\n`, {
      append: true,
    });
  }, [setCurrentTab, reset, tabFile]);

  const [, enable] = useAtom(enableAllAtom);
  const allEnabled = useAtomValue(allEnabledAtom);

  const keyMap = useAtomValue(keyMapAtom);
  const setThreat = useSetAtom(currentThreatAtom);

  const [, setAnalysisTab] = useAtom(currentAnalysisTabAtom);
  const [currentTabSelected, setCurrentTabSelected] = useAtom(currentTabSelectedAtom);
  const [, setReportModalOpen] = useAtom(currentReportModalOpenAtom);
  const practiceTabSelected = useAtomValue(currentPracticeTabAtom);
  const practicing = currentTabSelected === "practice" && practiceTabSelected === "train";
  const practiceState = useAtomValue(practiceStateAtom);
  const isPracticeRating = practicing && practiceState.phase === "correct";

  const setPracticePath = useStore(store, (s) => s.setPracticePath);
  useEffect(() => {
    if (!practicing) {
      setPracticePath(null);
    }
  }, [practicing, setPracticePath]);

  useHotkeys([
    [keyMap.SAVE_FILE.keys, () => userSaveFile()],
    [keyMap.CLEAR_SHAPES.keys, () => clearShapes()],
  ]);
  useHotkeys([
    [keyMap.ANNOTATION_BRILLIANT.keys, () => !isPracticeRating && setAnnotation("!!")],
    [keyMap.ANNOTATION_GOOD.keys, () => !isPracticeRating && setAnnotation("!")],
    [keyMap.ANNOTATION_INTERESTING.keys, () => !isPracticeRating && setAnnotation("!?")],
    [keyMap.ANNOTATION_DUBIOUS.keys, () => !isPracticeRating && setAnnotation("?!")],
    [keyMap.ANNOTATION_MISTAKE.keys, () => !isPracticeRating && setAnnotation("?")],
    [keyMap.ANNOTATION_BLUNDER.keys, () => !isPracticeRating && setAnnotation("??")],
    [
      keyMap.PRACTICE_TAB.keys,
      () => {
        if (isRepertoire) setCurrentTabSelected("practice");
      },
    ],
    [keyMap.ANALYSIS_TAB.keys, () => setCurrentTabSelected("analysis")],
    [
      keyMap.GENERATE_REPORT.keys,
      (e) => {
        setCurrentTabSelected("analysis");
        setAnalysisTab("report");
        setReportModalOpen(true);
        e.preventDefault();
      },
    ],
    [keyMap.DATABASE_TAB.keys, () => setCurrentTabSelected("database")],
    [keyMap.ANNOTATE_TAB.keys, () => setCurrentTabSelected("annotate")],
    [keyMap.INFO_TAB.keys, () => setCurrentTabSelected("info")],
    [keyMap.TOGGLE_THREAT.keys, () => setThreat((threat) => !threat)],
    [
      keyMap.TOGGLE_ALL_ENGINES.keys,
      (e) => {
        enable(!allEnabled);
        e.preventDefault();
      },
    ],
  ]);

  return (
    <>
      <AnnotationSymbolHotkeys
        onAnnotate={(annotation) => !isPracticeRating && setAnnotation(annotation)}
      />
      <Modal
        opened={pendingTrainingSync !== null}
        onClose={() => !savingRepertoire && setPendingTrainingSync(null)}
        closeOnClickOutside={!savingRepertoire}
        closeOnEscape={!savingRepertoire}
        title={t("OpeningEdit.SaveDecisionTitle", "How do you want to save these changes?")}
        size="lg"
      >
        {pendingTrainingSync && (
          <Stack>
            <Alert color="blue" variant="light">
              {t(
                "OpeningEdit.SaveDecisionDescription",
                "Nothing has been saved yet. You can update only the editable PGN, update both the PGN and its training lines, or discard the changes.",
              )}
            </Alert>
            <Group grow>
              <Paper withBorder p="md">
                <Text size="xs" c="dimmed">
                  {t("OpeningEdit.Added", "Added")}
                </Text>
                <Text fw={700} size="xl">
                  {pendingTrainingSync.addedLines}
                </Text>
              </Paper>
              <Paper withBorder p="md">
                <Text size="xs" c="dimmed">
                  {t("OpeningEdit.Changed", "Changed")}
                </Text>
                <Text fw={700} size="xl">
                  {pendingTrainingSync.changedLines}
                </Text>
              </Paper>
              <Paper withBorder p="md">
                <Text size="xs" c="dimmed">
                  {t("OpeningEdit.Removed", "Removed")}
                </Text>
                <Text fw={700} size="xl">
                  {pendingTrainingSync.removedLines}
                </Text>
              </Paper>
            </Group>
            <Text size="sm" c="dimmed">
              {t(
                "OpeningEdit.ProgressPolicy",
                "Progress is preserved for matching lines. New lines start without progress; removed lines leave the training queue.",
              )}
            </Text>
            <Group justify="space-between" align="flex-end">
              <Button
                variant="default"
                color="gray"
                disabled={savingRepertoire}
                onClick={() => void discardRepertoireChanges()}
              >
                {t("OpeningEdit.DiscardChanges", "Discard changes")}
              </Button>
              <Group>
                <Button
                  variant="default"
                  loading={savingRepertoire}
                  onClick={async () => {
                    if (await saveRepertoirePgnOnly()) setPendingTrainingSync(null);
                  }}
                >
                  {t("OpeningEdit.SavePgnOnly", "Save PGN only")}
                </Button>
                <Button
                  loading={savingRepertoire}
                  onClick={async () => {
                    if (await saveRepertoireAndTraining(pendingTrainingSync)) {
                      setPendingTrainingSync(null);
                    }
                  }}
                >
                  {t("OpeningEdit.SaveAndUpdateTraining", "Save and update training")}
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
      <EvalListener persistScore={!practicing} />
      <Portal target="#left" style={{ height: "100%" }}>
        <Board
          practicing={practicing}
          editingMode={editingMode}
          boardRef={boardRef}
          selectedPiece={selectedPiece}
        />
      </Portal>
      <Portal target="#panel-tools">
        <Paper
          withBorder
          style={{
            height: "100%",
          }}
          pos="relative"
        >
          <Tabs
            w="100%"
            h="100%"
            value={currentTabSelected}
            onChange={(v) => setCurrentTabSelected(v || "info")}
            keepMounted={false}
            activateTabWithKeyboard={false}
            style={{
              display: "flex",
              flexDirection: "column",
            }}
            styles={{
              tabLabel: {
                flex: 0,
              },
              tab: {
                display: "flex",
                justifyContent: "center",
                gap: "0.3rem",
              },
            }}
          >
            {/* The tab bar lives in the zone header, so it stays visible when the zone is folded. */}
            <PanelHeader zone="tools">
              <Tabs.List grow>
                {isRepertoire && (
                  <Tabs.Tab value="practice" leftSection={<IconTargetArrow size="1rem" />}>
                    {t("Board.Tabs.Practice")}
                  </Tabs.Tab>
                )}
                <Tabs.Tab value="analysis" leftSection={<IconZoomCheck size="1rem" />}>
                  {t("Board.Tabs.Analysis")}
                </Tabs.Tab>
                <Tabs.Tab value="database" leftSection={<IconDatabase size="1rem" />}>
                  {t("Board.Tabs.Database")}
                </Tabs.Tab>
                <Tabs.Tab value="annotate" leftSection={<IconNotes size="1rem" />}>
                  {t("Board.Tabs.Annotate")}
                </Tabs.Tab>
                <Tabs.Tab value="info" leftSection={<IconInfoCircle size="1rem" />}>
                  {t("Board.Tabs.Info")}
                </Tabs.Tab>
              </Tabs.List>
            </PanelHeader>
            {isRepertoire && (
              <Tabs.Panel value="practice" flex={1} style={{ overflowY: "hidden" }}>
                <PracticePanel saveFile={userSaveFile} />
              </Tabs.Panel>
            )}
            <Tabs.Panel value="info" flex={1} style={{ overflowY: "hidden" }}>
              <InfoPanel addGame={addGame} />
            </Tabs.Panel>
            <Tabs.Panel value="database" flex={1} style={{ overflowY: "hidden" }}>
              <DatabasePanel />
            </Tabs.Panel>
            <Tabs.Panel value="annotate" flex={1} style={{ overflowY: "hidden" }}>
              <AnnotationPanel />
            </Tabs.Panel>
            <Tabs.Panel value="analysis" flex={1} style={{ overflowY: "hidden" }}>
              <AnalysisPanel />
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </Portal>
      <PanelHeader zone="notation">
        <PanelTitle>
          {editingMode
            ? t("Panels.EditPosition", "Edit position")
            : t("Panels.Notation", "Notation")}
        </PanelTitle>
      </PanelHeader>
      <Portal target="#panel-notation">
        {editingMode ? (
          <EditingCard
            boardRef={boardRef}
            setEditingMode={toggleEditingMode}
            selectedPiece={selectedPiece}
            setSelectedPiece={setSelectedPiece}
          />
        ) : (
          <Stack h="100%" gap="xs">
            {isRepertoire && dirty && !practicing && (
              <Paper withBorder p="xs">
                <Stack gap="xs">
                  <div>
                    <Text size="sm" fw={600}>
                      {t("OpeningEdit.UnsavedRepertoireChanges", "Unsaved repertoire changes")}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t(
                        "OpeningEdit.ExplicitSaveHelp",
                        "Choose whether to change only the PGN or also rebuild the training lines.",
                      )}
                    </Text>
                  </div>
                  <Group gap="xs" wrap="wrap">
                    <Button
                      size="compact-xs"
                      variant="default"
                      disabled={savingRepertoire}
                      onClick={() => void discardRepertoireChanges()}
                    >
                      {t("OpeningEdit.Discard", "Discard")}
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="default"
                      loading={savingRepertoire}
                      onClick={() => void saveRepertoirePgnOnly()}
                    >
                      {t("OpeningEdit.SavePgnOnly", "Save PGN only")}
                    </Button>
                    <Button
                      size="compact-xs"
                      loading={savingRepertoire}
                      onClick={() => void saveRepertoireAndTraining()}
                    >
                      {t("OpeningEdit.SaveAndUpdateTraining", "Save and update training")}
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            )}
            <DetachedEval />
            <GameNotation
              topBar
              controls={
                <BoardControls
                  editingMode={editingMode}
                  toggleEditingMode={toggleEditingMode}
                  dirty={dirty}
                  saveFile={userSaveFile}
                  onGenerateModelGame={generateModelGameFromPosition}
                />
              }
            />
            <MoveControls />
          </Stack>
        )}
      </Portal>
    </>
  );
}

export default BoardAnalysis;
