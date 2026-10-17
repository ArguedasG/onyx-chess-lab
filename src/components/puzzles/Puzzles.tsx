import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Portal,
  ScrollArea,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useSessionStorage } from "@mantine/hooks";
import {
  IconFlame,
  IconPlus,
  IconSettings,
  IconTrash,
  IconX,
  IconZoomCheck,
} from "@tabler/icons-react";
import { isNormal, makeSquare, makeUci, parseUci } from "chessops";
import { parseFen } from "chessops/fen";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { commands, type PuzzleDatabaseInfo } from "@/bindings";
import {
  activeTabAtom,
  currentPuzzleAtom,
  currentPuzzleTimerAtom,
  hidePuzzleRatingAtom,
  jumpToNextPuzzleAtom,
  progressivePuzzlesAtom,
  puzzleCandidatesAtom,
  puzzleLengthAtom,
  puzzleModeAtom,
  puzzleQualityAtom,
  puzzleRatingRangeAtom,
  puzzleRushSettingsAtom,
  puzzleExcludedThemesAtom,
  puzzleThemeModeAtom,
  puzzleThemesAtom,
  selectedPuzzleDbAtom,
  tabsAtom,
  trackPuzzleTimeAtom,
} from "@/state/atoms";
import { useTacticsReview } from "@/state/tacticsReview";
import { positionFromFen } from "@/utils/chessops";
import { formatThemeLabel, formatTime } from "@/utils/format";
import {
  applyRushResult,
  buildPuzzleFilter,
  finishRushIfTimeUp,
  rushRange,
  rushScore,
  rushTimeLeft,
  startRush,
  type PuzzleMode,
  type RushState,
} from "@/utils/puzzleSession";
import { type Completion, getPuzzleDatabases, type Puzzle } from "@/utils/puzzles";
import { PROVISIONAL_DEVIATION, ratingBandFor, updateTacticsRating } from "@/utils/tacticsRating";
import { addTacticsReviewItem, recordBest, withRating } from "@/utils/tacticsReview";
import { createTab } from "@/utils/tabs";
import { defaultTree } from "@/utils/treeReducer";
import ChallengeHistory from "../common/ChallengeHistory";
import ConfirmModal from "../common/ConfirmModal";
import GameNotation from "../common/GameNotation";
import MoveControls from "../common/MoveControls";
import { TreeStateContext } from "../common/TreeStateContext";
import { PanelHeader, PanelTitle } from "../tabs/RightColumn";
import AddPuzzle from "./AddPuzzle";
import PuzzleBoard from "./PuzzleBoard";
import PuzzleCandidates from "./PuzzleCandidates";
import PuzzleFilters from "./PuzzleFilters";
import PuzzleModePanel from "./PuzzleModePanel";

const isRated = (mode: PuzzleMode) => mode === "free" || mode === "countdown";

function Puzzles({ id }: { id: string }) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const setFen = useStore(store, (s) => s.setFen);
  const goToStart = useStore(store, (s) => s.goToStart);
  const reset = useStore(store, (s) => s.reset);
  const makeMove = useStore(store, (s) => s.makeMove);
  const makeMoves = useStore(store, (s) => s.makeMoves);
  const setShapes = useStore(store, (s) => s.setShapes);
  const currentMove = useStore(store, (s) => s.currentNode().move);
  const plyOnBoard = useStore(store, (s) => s.position.length);
  const [puzzles, setPuzzles] = useSessionStorage<Puzzle[]>({
    key: `${id}-puzzles`,
    defaultValue: [],
  });
  const [currentPuzzle, setCurrentPuzzle] = useAtom(currentPuzzleAtom);

  const [puzzleDbs, setPuzzleDbs] = useState<PuzzleDatabaseInfo[]>([]);
  const [selectedDb, setSelectedDb] = useAtom(selectedPuzzleDbAtom);
  const [settingsOpened, setSettingsOpened] = useState(false);

  useEffect(() => {
    getPuzzleDatabases().then((databases) => {
      setPuzzleDbs(databases);
    });
  }, []);

  const ratingRange = useAtomValue(puzzleRatingRangeAtom);
  const setRatingRange = useSetAtom(puzzleRatingRangeAtom);
  const themes = useAtomValue(puzzleThemesAtom);
  const themeMode = useAtomValue(puzzleThemeModeAtom);
  const excludedThemes = useAtomValue(puzzleExcludedThemesAtom);
  const quality = useAtomValue(puzzleQualityAtom);
  const length = useAtomValue(puzzleLengthAtom);
  const [mode, setMode] = useAtom(puzzleModeAtom);
  const [rushSettings, setRushSettings] = useAtom(puzzleRushSettingsAtom);
  const candidatesEnabled = useAtomValue(puzzleCandidatesAtom);
  const progressive = useAtomValue(progressivePuzzlesAtom);
  const hideRating = useAtomValue(hidePuzzleRatingAtom);
  const trackTime = useAtomValue(trackPuzzleTimeAtom);
  const jumpToNextPuzzleImmediately = useAtomValue(jumpToNextPuzzleAtom);
  const { state: review, update: updateReview } = useTacticsReview();

  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const [themesTableMissing, setThemesTableMissing] = useState(false);
  const effectiveThemes = themes.filter((theme) => availableThemes.includes(theme));

  useEffect(() => {
    setThemesTableMissing(false);
    if (!selectedDb) {
      setAvailableThemes([]);
      return;
    }
    commands.getPuzzleThemes(selectedDb).then((res) => {
      if (res.status === "ok") {
        setAvailableThemes(res.data);
        return;
      }
      setAvailableThemes([]);
      if (typeof res.error === "string" && res.error.includes("no such table")) {
        setThemesTableMissing(true);
      }
    });
  }, [selectedDb]);

  // Session modes: storm and streak keep their own state; countdown times each puzzle.
  const [rush, setRush] = useState<RushState | null>(null);
  const rushRef = useRef<RushState | null>(null);
  rushRef.current = rush;
  const [newBest, setNewBest] = useState(false);
  const [countdownStart, setCountdownStart] = useState<number | null>(null);
  const [noPuzzles, setNoPuzzles] = useState(false);
  const finishedRef = useRef(new Set<string>());
  const rushActive = rush?.status === "running";

  const wonPuzzles = puzzles.filter((p) => p.completion === "correct");
  const lostPuzzles = puzzles.filter((p) => p.completion === "incorrect");
  const totalCompleted = wonPuzzles.length + lostPuzzles.length;
  const accuracy =
    totalCompleted > 0 ? Math.round((wonPuzzles.length / totalCompleted) * 100) : null;

  let currentStreak = 0;
  for (let i = puzzles.length - 1; i >= 0; i--) {
    if (puzzles[i].completion === "correct") currentStreak++;
    else if (puzzles[i].completion === "incorrect") break;
  }

  const avgTimeSeconds =
    wonPuzzles.length > 0
      ? wonPuzzles.reduce((acc, p) => acc + (p.timeSpent || 0), 0) / wonPuzzles.length / 1000
      : 0;

  function setPuzzle(puzzle: { fen: string; moves: string[] }) {
    setFen(puzzle.fen);
    makeMove({ payload: parseUci(puzzle.moves[0])! });
  }

  const solutionAbortRef = useRef<AbortController | null>(null);

  async function generatePuzzle(
    db: string,
    force: boolean = false,
    rangeOverride?: [number, number],
  ) {
    let nextIndex = puzzles.findIndex((p, i) => i > currentPuzzle && p.completion === "incomplete");
    if (nextIndex === -1) {
      nextIndex = puzzles.findIndex((p, i) => i < currentPuzzle && p.completion === "incomplete");
    }

    const running = rushRef.current?.status === "running";
    if (nextIndex !== -1 && !force && !running) {
      solutionAbortRef.current?.abort();
      setIsPlayingSolution(false);
      setCurrentPuzzle(nextIndex);
      setPuzzle(puzzles[nextIndex]);
      setCountdownStart(Date.now());
      if (trackTime) {
        setTimerStart(Date.now() - (puzzles[nextIndex].timeSpent || 0));
      }
      return;
    }

    solutionAbortRef.current?.abort();
    setIsPlayingSolution(false);

    let range =
      rangeOverride ?? (running && rushRef.current ? rushRange(rushRef.current) : ratingRange);
    if (progressive && !rangeOverride && !running) {
      const rating = puzzles[currentPuzzle]?.rating;
      if (rating) {
        range = [rating + 50, rating + 100];
        setRatingRange([rating + 50, rating + 100]);
      }
    }
    const res = await commands.getPuzzle(
      db,
      buildPuzzleFilter({
        range,
        themes: effectiveThemes,
        themeMode,
        excludeThemes: excludedThemes.filter((theme) => availableThemes.includes(theme)),
        quality,
        length,
      }),
    );
    if (res.status === "error") {
      setNoPuzzles(true);
      return;
    }
    setNoPuzzles(false);
    const newPuzzle: Puzzle = {
      ...res.data,
      moves: res.data.moves.split(" "),
      completion: "incomplete",
    };
    setPuzzles((puzzles) => [...puzzles, newPuzzle]);
    setCurrentPuzzle(puzzles.length);
    setPuzzle(newPuzzle);
    setCountdownStart(Date.now());
    if (trackTime) {
      setTimerStart(Date.now());
    }
  }

  /** Rating, review and session modes react once to the first result of each puzzle. */
  function handleFinished(index: number, puzzle: Puzzle, completion: "correct" | "incorrect") {
    const key = `${index}:${puzzle.id}`;
    if (finishedRef.current.has(key)) return;
    finishedRef.current.add(key);
    const solved = completion === "correct";
    const current = rushRef.current;
    if (isRated(mode) && !current) {
      updateReview((state) =>
        withRating(
          state,
          updateTacticsRating(
            state.rating,
            { rating: puzzle.rating, deviation: puzzle.rating_deviation },
            solved,
          ),
        ),
      );
    }
    if (!solved) {
      updateReview((state) =>
        state.autoAdd
          ? addTacticsReviewItem(state, {
              id: `lichess:${puzzle.id}`,
              fen: puzzle.fen,
              solution: puzzle.moves,
              opponentFirst: true,
              label: t("Puzzle.ReviewLabel", "Lichess puzzle {{rating}}", {
                rating: puzzle.rating,
              }),
              rating: puzzle.rating,
              themes: puzzle.themes ?? [],
              source: "puzzles",
            })
          : state,
      );
    }
    if (current?.status === "running" && selectedDb) {
      const next = applyRushResult(current, solved, puzzle.rating);
      setRush(next);
      if (next.status === "over") {
        endRush(next);
        return;
      }
      setTimeout(() => void generatePuzzle(selectedDb, true, rushRange(next)), solved ? 250 : 900);
    }
  }

  function endRush(state: RushState) {
    const score = rushScore(state);
    const previous = review?.best[state.mode]?.score ?? 0;
    setNewBest(score > previous);
    updateReview((current) => recordBest(current, state.mode, score));
  }

  async function changeCompletion(completion: Completion) {
    const timeSpent = timerStart !== null ? Date.now() - timerStart : 0;
    const index = currentPuzzle;
    const puzzle = puzzles[index];
    setPuzzles((puzzles) => {
      puzzles[index].completion = completion;
      puzzles[index].timeSpent = timeSpent;
      return [...puzzles];
    });
    setTimerStart(null);

    let themesOfPuzzle = puzzle?.themes;
    if (selectedDb && puzzle?.id) {
      const res = await commands.getThemesForPuzzle(selectedDb, puzzle.id);
      if (res.status === "ok") {
        themesOfPuzzle = res.data;
        setPuzzles((puzzles) => {
          if (puzzles[index]) puzzles[index].themes = res.data;
          return [...puzzles];
        });
      }
    }
    if (puzzle && completion !== "incomplete") {
      handleFinished(index, { ...puzzle, themes: themesOfPuzzle }, completion);
    }
  }

  function startRushSession() {
    if (!selectedDb || (mode !== "storm" && mode !== "streak")) return;
    const settled = review && review.rating.deviation < PROVISIONAL_DEVIATION;
    const base = settled ? review.rating.rating : (ratingRange[0] + ratingRange[1]) / 2;
    const state = startRush(mode, rushSettings, base);
    setNewBest(false);
    setRush(state);
    rushRef.current = state;
    void generatePuzzle(selectedDb, true, rushRange(state));
  }

  function stopRush() {
    const current = rushRef.current;
    if (current?.status === "running") endRush({ ...current, status: "over" });
    setRush(null);
  }

  const [addOpened, setAddOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [isPlayingSolution, setIsPlayingSolution] = useState(false);

  const [timerStart, setTimerStart] = useAtom(currentPuzzleTimerAtom);
  const [, setTick] = useState(0);
  const isPuzzleIncomplete = puzzles[currentPuzzle]?.completion === "incomplete";
  const elapsedTime =
    timerStart && isPuzzleIncomplete && trackTime
      ? Date.now() - timerStart
      : puzzles[currentPuzzle]?.timeSpent || 0;

  useEffect(() => {
    if (trackTime && isPuzzleIncomplete && timerStart === null) {
      setTimerStart(Date.now());
    }
  }, [trackTime, isPuzzleIncomplete, timerStart, setTimerStart]);

  const countdownActive = mode === "countdown" && isPuzzleIncomplete && countdownStart !== null;
  const needsTick =
    (trackTime && isPuzzleIncomplete && timerStart !== null) || countdownActive || rushActive;
  useEffect(() => {
    if (!needsTick) return;
    const displayInterval = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(displayInterval);
  }, [needsTick]);

  // Storm: the clock can run out between puzzles.
  const changeCompletionRef = useRef(changeCompletion);
  changeCompletionRef.current = changeCompletion;
  const endRushRef = useRef(endRush);
  endRushRef.current = endRush;
  const stormLeft = rush ? rushTimeLeft(rush) : null;
  useEffect(() => {
    if (!rush || rush.status !== "running" || stormLeft === null || stormLeft > 0) return;
    const finished = finishRushIfTimeUp(rush);
    setRush(finished);
    endRushRef.current(finished);
  }, [rush, stormLeft]);

  // Countdown: running out of time is a miss.
  const countdownLeft =
    countdownActive && countdownStart !== null
      ? Math.max(0, rushSettings.countdownSeconds * 1000 - (Date.now() - countdownStart))
      : null;
  useEffect(() => {
    if (countdownLeft === 0) void changeCompletionRef.current("incorrect");
  }, [countdownLeft]);

  useEffect(() => {
    return () => {
      if (trackTime && timerStart !== null && isPuzzleIncomplete) {
        const finalElapsed = Date.now() - timerStart;
        setPuzzles((prev) => {
          const newPuzzles = [...prev];
          if (newPuzzles[currentPuzzle]) {
            newPuzzles[currentPuzzle].timeSpent = finalElapsed;
          }
          return newPuzzles;
        });
      }
    };
  }, [trackTime, timerStart, currentPuzzle, isPuzzleIncomplete, setPuzzles]);

  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const turnToMove =
    puzzles[currentPuzzle] !== undefined
      ? positionFromFen(puzzles[currentPuzzle]?.fen)[0]?.turn
      : null;

  const currentlyOnLastMoveOrNoLastMove = (): boolean => {
    if (!currentMove) return true;
    const moves = puzzles[currentPuzzle]?.moves;
    if (!moves) return true;
    const lastMoveIndex = moves.indexOf(makeUci(currentMove));
    return lastMoveIndex + 1 === moves.length;
  };

  const nextMoveUci = () => {
    const curPuzzle = puzzles[currentPuzzle];
    if (!curPuzzle || !currentMove) return;
    const indexOfNextMoveToPlay = curPuzzle.moves.indexOf(makeUci(currentMove)) + 1;
    const nextMoveUci = curPuzzle.moves[indexOfNextMoveToPlay];
    if (!nextMoveUci) return;
    const nextMove = parseUci(nextMoveUci);
    if (!nextMove || !isNormal(nextMove)) return;
    return nextMove;
  };

  const puzzle = puzzles[currentPuzzle];
  const showCandidates =
    candidatesEnabled &&
    !rushActive &&
    puzzle !== undefined &&
    isPuzzleIncomplete &&
    plyOnBoard === 1;

  /** A correct candidate is played on the board; the rest of the puzzle continues there. */
  function playCandidate() {
    if (!puzzle || !selectedDb) return;
    if (puzzle.moves.length <= 2) {
      makeMoves({ payload: puzzle.moves.slice(1, 2), mainline: true, changeHeaders: false });
      void changeCompletion("correct").then(() => {
        if (jumpToNextPuzzleImmediately) void generatePuzzle(selectedDb);
      });
      return;
    }
    makeMoves({ payload: puzzle.moves.slice(1, 3), mainline: true, changeHeaders: false });
  }

  const tacticalRating = review?.rating;
  const ratingProvisional = !tacticalRating || tacticalRating.deviation >= PROVISIONAL_DEVIATION;

  return (
    <>
      <Portal target="#left" style={{ height: "100%" }}>
        <PuzzleBoard
          key={currentPuzzle}
          puzzles={puzzles}
          currentPuzzle={currentPuzzle}
          changeCompletion={changeCompletion}
          generatePuzzle={generatePuzzle}
          db={selectedDb}
          autoJump={jumpToNextPuzzleImmediately && !rushActive}
        />
      </Portal>
      <PanelHeader zone="tools">
        <PanelTitle>{t("Home.Card.Puzzle.Title")}</PanelTitle>
      </PanelHeader>
      <Portal target="#panel-tools">
        <Paper h="100%" withBorder p="md" style={{ overflow: "hidden" }}>
          <ScrollArea h="100%" type="auto" offsetScrollbars>
            <AddPuzzle
              puzzleDbs={puzzleDbs}
              opened={addOpened}
              setOpened={setAddOpened}
              setPuzzleDbs={setPuzzleDbs}
            />
            <ConfirmModal
              title={t("Puzzle.DeleteDatabase", "Delete puzzle database")}
              description={t(
                "Puzzle.DeleteDatabaseDesc",
                "Are you sure you want to delete this puzzle database?",
              )}
              opened={deleteModalOpened}
              onClose={() => setDeleteModalOpened(false)}
              onConfirm={async () => {
                if (selectedDb) {
                  await commands.deletePuzzleDatabase(selectedDb);
                  setPuzzleDbs((dbs) => dbs.filter((db) => db.path !== selectedDb));
                  setSelectedDb(null);
                  setPuzzles([]);
                  reset();
                  setTimerStart(null);
                  setIsPlayingSolution(false);
                }
                setDeleteModalOpened(false);
              }}
            />
            <Stack gap="sm">
              <Group justify="space-between">
                <Select
                  style={{ flex: 1 }}
                  data={puzzleDbs
                    .map((p) => ({
                      label: p.title.split(".db3")[0],
                      value: p.path,
                    }))
                    .concat({ label: `+ ${t("Common.AddNew")}`, value: "add" })}
                  value={selectedDb}
                  clearable={false}
                  placeholder={t("Puzzle.SelectDatabase")}
                  onChange={(v) => {
                    if (v === "add") {
                      setAddOpened(true);
                    } else {
                      setSelectedDb(v);
                    }
                  }}
                />
                <Group gap="xs">
                  <Tooltip label={t("Puzzle.DeleteDatabase", "Delete puzzle database")}>
                    <ActionIcon
                      color="red"
                      disabled={!selectedDb}
                      onClick={() => setDeleteModalOpened(true)}
                    >
                      <IconTrash size={20} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t("Puzzle.Filters", "Filters and options")}>
                    <ActionIcon
                      variant={settingsOpened ? "filled" : "default"}
                      onClick={() => setSettingsOpened((o) => !o)}
                    >
                      <IconSettings size={20} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <Accordion
                value={settingsOpened ? "settings" : null}
                onChange={(v) => setSettingsOpened(v === "settings")}
              >
                <Accordion.Item value="settings" style={{ borderBottom: "none" }}>
                  <Accordion.Panel>
                    <PuzzleFilters
                      availableThemes={availableThemes}
                      themesTableMissing={themesTableMissing}
                      myLevel={
                        tacticalRating && !ratingProvisional ? ratingBandFor(tacticalRating) : null
                      }
                      rushActive={rushActive}
                      onTrackTimeOff={() => setTimerStart(null)}
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>

              <PuzzleModePanel
                mode={mode}
                onModeChange={(next) => {
                  setRush(null);
                  setMode(next);
                }}
                settings={rushSettings}
                onSettingsChange={setRushSettings}
                rush={rush}
                stormLeftMs={stormLeft}
                countdownLeftMs={countdownLeft}
                best={{ storm: review?.best.storm?.score, streak: review?.best.streak?.score }}
                newBest={newBest}
                disabled={!selectedDb}
                onStart={startRushSession}
                onStop={stopRush}
              />

              {noPuzzles && (
                <Alert color="yellow" variant="light" p="xs">
                  {t(
                    "Puzzle.NoMatch",
                    "No puzzle matches these filters. Widen the rating range, the themes or the quality.",
                  )}
                </Alert>
              )}

              <Group grow>
                <Paper withBorder p="xs">
                  <Text size="xs" c="dimmed">
                    {t("Puzzle.Rating")}
                  </Text>
                  <Text fw={700} size="lg">
                    {isPuzzleIncomplete && hideRating && puzzle?.rating
                      ? "?"
                      : puzzle?.rating || "-"}
                  </Text>
                </Paper>
                {trackTime && (
                  <Paper withBorder p="xs">
                    <Text size="xs" c="dimmed">
                      {t("Puzzle.Time")}
                    </Text>
                    <Text fw={700} size="lg" ff="monospace">
                      {formatTime(elapsedTime)}
                    </Text>
                  </Paper>
                )}
                <Paper withBorder p="xs">
                  <Text size="xs" c="dimmed">
                    {t("Puzzle.Accuracy")}
                  </Text>
                  <Text
                    fw={700}
                    size="lg"
                    c={accuracy === null ? "dimmed" : accuracy >= 50 ? "teal" : "orange"}
                  >
                    {accuracy !== null ? `${accuracy}%` : "-"}
                  </Text>
                </Paper>
                <Paper withBorder p="xs">
                  <Text size="xs" c="dimmed">
                    {t("Puzzle.Streak")}
                  </Text>
                  <Group gap={2}>
                    <Text fw={700} size="lg">
                      {currentStreak}
                    </Text>
                    <IconFlame size={20} color="orange" />
                  </Group>
                </Paper>
                <Tooltip
                  label={t(
                    "Puzzle.TacticalRatingTip",
                    "Glicko-2 against the rating of each puzzle, first try only, in free and countdown modes.",
                  )}
                  multiline
                  w={260}
                >
                  <Paper withBorder p="xs">
                    <Text size="xs" c="dimmed">
                      {t("Puzzle.TacticalRating", "My rating")}
                    </Text>
                    <Text fw={700} size="lg">
                      {tacticalRating
                        ? `${tacticalRating.rating}${ratingProvisional ? "?" : ""}`
                        : "-"}
                    </Text>
                  </Paper>
                </Tooltip>
                {trackTime && avgTimeSeconds > 0 && (
                  <Paper withBorder p="xs">
                    <Text size="xs" c="dimmed">
                      {t("Puzzle.AvgTime")}
                    </Text>
                    <Text fw={700} size="lg">
                      {avgTimeSeconds.toFixed(1)}s
                    </Text>
                  </Paper>
                )}
              </Group>

              {!isPuzzleIncomplete && (puzzle?.themes?.length ?? 0) > 0 && (
                <Group gap="xs">
                  {puzzle?.themes?.map((theme) => (
                    <Badge key={theme} variant="light" size="sm">
                      {formatThemeLabel(theme)}
                    </Badge>
                  ))}
                </Group>
              )}

              <Group justify="space-between">
                <Text fz="1.5rem" fw={500}>
                  {!turnToMove
                    ? ""
                    : turnToMove === "white"
                      ? t("Fen.BlackToMove")
                      : t("Fen.WhiteToMove")}
                </Text>
                <Group gap="xs">
                  <Tooltip label={t("Puzzle.NewPuzzle")}>
                    <ActionIcon
                      disabled={!selectedDb || rushActive}
                      onClick={() => generatePuzzle(selectedDb!, true)}
                    >
                      <IconPlus />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t("Puzzle.AnalyzePosition")}>
                    <ActionIcon
                      disabled={!selectedDb || !puzzle}
                      onClick={() =>
                        createTab({
                          tab: {
                            name: "Puzzle Analysis",
                            type: "analysis",
                          },
                          setTabs,
                          setActiveTab,
                          pgn: puzzle?.moves.join(" "),
                          headers: {
                            ...defaultTree().headers,
                            fen: puzzle?.fen,
                            orientation:
                              parseFen(puzzle.fen).unwrap().turn === "white" ? "black" : "white",
                          },
                        })
                      }
                    >
                      <IconZoomCheck />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t("Puzzle.ClearSession")}>
                    <ActionIcon
                      disabled={rushActive}
                      onClick={() => {
                        setPuzzles([]);
                        reset();
                        setTimerStart(null);
                        setIsPlayingSolution(false);
                        finishedRef.current.clear();
                      }}
                    >
                      <IconX />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              {showCandidates && puzzle && (
                <PuzzleCandidates
                  key={`${currentPuzzle}-${puzzle.id}`}
                  puzzle={puzzle}
                  onCorrect={playCandidate}
                  onWrong={() => void changeCompletion("incorrect")}
                />
              )}

              <Group grow>
                <Button
                  variant="light"
                  fullWidth
                  onClick={async () => {
                    solutionAbortRef.current?.abort();
                    setIsPlayingSolution(false);
                    const abortController = new AbortController();
                    solutionAbortRef.current = abortController;
                    const curPuzzle = puzzles[currentPuzzle];

                    if (curPuzzle.completion === "incomplete") {
                      changeCompletion("incorrect");
                    }

                    if (currentlyOnLastMoveOrNoLastMove()) return;

                    const nextMove = nextMoveUci();
                    if (!nextMove) return;

                    const from = makeSquare(nextMove.from);
                    const to = makeSquare(nextMove.to);
                    const currentShapes = store.getState().currentNode().shapes;

                    // Progressive hints: circle > arrow > clear
                    const hasCircle = currentShapes.some((s) => s.orig === from && !s.dest);
                    const hasArrow = currentShapes.some((s) => s.orig === from && s.dest === to);

                    if (hasArrow) {
                      setShapes(
                        currentShapes.filter(
                          (s) => !(s.orig === from && (!s.dest || s.dest === to)),
                        ),
                      );
                    } else if (hasCircle) {
                      setShapes([
                        ...currentShapes.filter((s) => !(s.orig === from && !s.dest)),
                        { orig: from, dest: to, brush: "green" },
                      ]);
                    } else {
                      setShapes([
                        ...currentShapes,
                        { orig: from, dest: undefined, brush: "green" },
                      ]);
                    }
                  }}
                  disabled={
                    puzzles.length === 0 ||
                    currentlyOnLastMoveOrNoLastMove() ||
                    isPlayingSolution ||
                    rushActive
                  }
                >
                  {t("Puzzle.GetAHint")}
                </Button>
                <Button
                  variant="light"
                  fullWidth
                  onClick={async () => {
                    solutionAbortRef.current?.abort();
                    const abortController = new AbortController();
                    solutionAbortRef.current = abortController;

                    const curPuzzle = puzzles[currentPuzzle];
                    if (curPuzzle.completion === "incomplete") {
                      changeCompletion("incorrect");
                    }
                    setIsPlayingSolution(true);
                    goToStart();
                    for (let i = 0; i < curPuzzle.moves.length; i++) {
                      if (abortController.signal.aborted) break;
                      makeMove({
                        payload: parseUci(curPuzzle.moves[i])!,
                        mainline: true,
                      });
                      await new Promise((r) => setTimeout(r, 500));
                    }
                    setIsPlayingSolution(false);
                  }}
                  disabled={puzzles.length === 0 || rushActive}
                >
                  {t("Puzzle.ViewSolution")}
                </Button>
              </Group>

              {puzzles.length > 0 && (
                <>
                  <Divider label={t("Puzzle.History", "This session")} labelPosition="left" />
                  <ChallengeHistory
                    challenges={puzzles.map((p) => ({
                      ...p,
                      label: p.rating?.toString() ?? "-",
                    }))}
                    current={currentPuzzle}
                    select={(i) => {
                      if (i === currentPuzzle || rushActive) return;
                      solutionAbortRef.current?.abort();
                      setIsPlayingSolution(false);
                      setCurrentPuzzle(i);
                      setPuzzle(puzzles[i]);
                      if (puzzles[i].completion === "incomplete") {
                        setTimerStart(Date.now() - (puzzles[i].timeSpent || 0));
                        setCountdownStart(Date.now());
                      } else {
                        setTimerStart(null);
                      }
                    }}
                  />
                </>
              )}
            </Stack>
          </ScrollArea>
        </Paper>
      </Portal>
      <PanelHeader zone="notation">
        <PanelTitle>{t("Panels.Notation", "Notation")}</PanelTitle>
      </PanelHeader>
      <Portal target="#panel-notation">
        <Stack h="100%" gap="xs">
          <GameNotation />
          <MoveControls readOnly />
        </Stack>
      </Portal>
    </>
  );
}

export default Puzzles;
