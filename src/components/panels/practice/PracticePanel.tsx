import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import {
  IconArrowBack,
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconCheck,
  IconEye,
  IconInfoCircle,
  IconSchool,
  IconTarget,
  IconX,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { formatNumber } from "@/utils/format";
import { useStore } from "zustand";
import { commands } from "@/bindings";
import ConfirmModal from "@/components/common/ConfirmModal";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import {
  buildFromTree,
  getCardForReview,
  getStats,
  syncDeck,
  updateCardPerformance,
  updateLinePerformance,
} from "@/components/files/opening";
import {
  currentEvalOpenAtom,
  currentInvisibleAtom,
  currentOpeningPracticeQueueAtom,
  currentPracticeTabAtom,
  currentPracticeUnitAtom,
  currentShowCommentsAtom,
  currentTabAtom,
  deckAtomFamily,
  type OpeningPracticeQueue,
  type PracticeSessionStats,
  practiceCardStartTimeAtom,
  practiceSessionStatsAtom,
  practiceStateAtom,
  practiceAutoDifficultyAtom,
} from "@/state/atoms";
import { getTabFile, getTabGameNumber } from "@/utils/tabs";
import { trainingAreasAtom } from "@/state/trainingAreas";
import {
  automaticOpeningLineGrade,
  type OpeningLine,
  recordOpeningLineSession,
  recordOpeningMoveAttempt,
} from "@/utils/trainingAreas";
import { parsePGN } from "@/utils/chess";
import { findFen, getNodeAtPath } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import {
  hasLearnAnnotations,
  learnedOpeningPrefixLength,
  markOpeningLineLearned,
  openingLearnMoveDelay,
  openingLearnStartPly,
  isOpeningLineLearned,
  nextOpeningLine,
} from "@/utils/openingLearning";
import { scheduleOpeningLineReview } from "@/utils/openingReview";
import OpeningLearnFeedback from "./OpeningLearnFeedback";
import OpeningLineFeedback from "./OpeningLineFeedback";
import { LogsModal, PositionsModal } from "./PracticeDeckModals";
import PracticeProgressSummary from "./PracticeProgressSummary";
import { findOpeningLinePath, getLineMoves, getLineRepresentativeIndices } from "./practiceLines";
import QualityRatingPanel from "./QualityRatingPanel";
import RepertoireInfo from "./RepertoireInfo";

/** Guided Learn: a demonstrated move stays on the board at least this long. */
const MIN_LEARN_DEMO_MS = 250;

function PracticePanel({ saveFile }: { saveFile?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const goToMove = useStore(store, (s) => s.goToMove);
  const setPracticePath = useStore(store, (s) => s.setPracticePath);
  const currentFen = useStore(store, (s) => s.currentNode().fen);
  const currentNode = useStore(store, (s) => s.currentNode());
  const position = useStore(store, (s) => s.position);
  const goToNext = useStore(store, (s) => s.goToNext);
  const setTreeState = useStore(store, (s) => s.setState);

  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const tabFile = getTabFile(currentTab);
  const [resetModal, toggleResetModal] = useToggle();

  const [deck, setDeck] = useAtom(
    deckAtomFamily({
      file: tabFile?.path || "",
      game: getTabGameNumber(currentTab),
    }),
  );

  const [syncMessage, setSyncMessage] = useState<{
    added: number;
    removed: number;
  } | null>(null);
  const deckPositionsRef = useRef(deck.positions);
  deckPositionsRef.current = deck.positions;
  const lastSyncedTreeRef = useRef<string | null>(null);

  useEffect(() => {
    const treeFingerprint = JSON.stringify(root);
    if (lastSyncedTreeRef.current === treeFingerprint) return;

    const orientation = headers.orientation || "white";
    const start = headers.start || [];

    if (deckPositionsRef.current.length === 0) {
      const newDeck = buildFromTree(root, orientation, start);
      if (newDeck.length > 0) {
        setDeck({ positions: newDeck, logs: [] });
      }
    } else {
      // Sync existing deck with tree changes
      const { positions, added, removed } = syncDeck(
        deckPositionsRef.current,
        root,
        orientation,
        start,
      );
      if (added > 0 || removed > 0) {
        setDeck((prev) => ({ ...prev, positions }));
        setSyncMessage({ added, removed });
        setTimeout(() => setSyncMessage(null), 5000);
      }
    }
    lastSyncedTreeRef.current = treeFingerprint;
  }, [root, headers, setDeck]);

  const stats = getStats(deck.positions);

  const setInvisible = useSetAtom(currentInvisibleAtom);
  const setShowComments = useSetAtom(currentShowCommentsAtom);
  const setEvalOpen = useSetAtom(currentEvalOpenAtom);
  const [practiceState, setPracticeState] = useAtom(practiceStateAtom);
  const [sessionStats, setSessionStats] = useAtom(practiceSessionStatsAtom);
  const setCardStartTime = useSetAtom(practiceCardStartTimeAtom);
  const practiceAutoDifficulty = useAtomValue(practiceAutoDifficultyAtom);
  const practiceUnit = useAtomValue(currentPracticeUnitAtom);
  const [openingQueue, setOpeningQueue] = useAtom(currentOpeningPracticeQueueAtom);
  const [trainingAreas, setTrainingAreas] = useAtom(trainingAreasAtom);
  const [pendingChapterStart, setPendingChapterStart] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedOpeningLineId = openingQueue?.lineIds?.[openingQueue.currentIndex];
  const selectedOpeningLine = selectedOpeningLineId
    ? trainingAreas.openings.lines[selectedOpeningLineId]
    : undefined;
  const learning = practiceUnit === "line" && openingQueue?.mode === "learn";
  const learnMoveDelay = openingLearnMoveDelay(trainingAreas.openings);
  const [learnFinished, setLearnFinished] = useState(false);
  const learnHandledRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    },
    [],
  );

  /** Load the chapter of a queue entry and start practicing it. */
  const openOpeningQueueEntry = useCallback(
    async (queue: OpeningPracticeQueue, index: number) => {
      if (!tabFile) return false;
      const gameNumber = queue.gameNumbers[index];
      if (gameNumber === undefined) return false;
      const records = unwrap(await commands.readGames(tabFile.path, gameNumber, gameNumber));
      if (!records[0]) return false;
      setTreeState(await parsePGN(records[0]));
      setCurrentTab((previous) => {
        if (previous.gameOrigin.kind !== "file" && previous.gameOrigin.kind !== "temp_file") {
          return previous;
        }
        return {
          ...previous,
          gameOrigin: { ...previous.gameOrigin, gameNumber },
        };
      });
      setOpeningQueue({ ...queue, currentIndex: index });
      setPracticeState({ phase: "idle" });
      setPendingChapterStart(true);
      return true;
    },
    [setCurrentTab, setOpeningQueue, setPracticeState, setTreeState, tabFile],
  );

  const advanceOpeningChapter = useCallback(
    async () =>
      openingQueue ? openOpeningQueueEntry(openingQueue, openingQueue.currentIndex + 1) : false,
    [openOpeningQueueEntry, openingQueue],
  );

  // After the last line of a session, the student can go on with the next line of the repertoire.
  const [finishedLineId, setFinishedLineId] = useState<string | null>(null);
  const lastQueueLineId = openingQueue?.lineIds?.at(-1);
  const atLastQueueLine =
    !!openingQueue && openingQueue.currentIndex + 1 >= openingQueue.gameNumbers.length;
  const nextLine =
    openingQueue?.repertoireId && lastQueueLineId
      ? nextOpeningLine(trainingAreas.openings, openingQueue.repertoireId, lastQueueLineId)
      : undefined;
  const learnedSessionLines = (openingQueue?.lineIds ?? [])
    .map((lineId) => trainingAreas.openings.lines[lineId])
    .filter((line): line is OpeningLine => !!line && isOpeningLineLearned(line));

  const startOpeningLines = useCallback(
    (lines: OpeningLine[], mode: "learn" | "practice") => {
      const entries = lines.flatMap((line) => {
        const variant = trainingAreas.openings.variants[line.variantId];
        return variant ? [{ line, variant }] : [];
      });
      if (entries.length === 0) return;
      setLearnFinished(false);
      setFinishedLineId(null);
      setSessionStats((previous) => ({
        ...previous,
        correct: 0,
        incorrect: 0,
        streak: 0,
        bestStreak: 0,
      }));
      void openOpeningQueueEntry(
        {
          mode,
          gameNumbers: entries.map(({ variant }) => variant.trainingRecordIndex),
          currentIndex: 0,
          repertoireId: openingQueue?.repertoireId,
          variantIds: entries.map(({ variant }) => variant.id),
          lineIds: entries.map(({ line }) => line.id),
          returnTarget: openingQueue?.returnTarget,
        },
        0,
      );
    },
    [openOpeningQueueEntry, openingQueue, setSessionStats, trainingAreas.openings.variants],
  );

  const newPractice = useCallback(
    (stats?: Partial<PracticeSessionStats>) => {
      if (deck.positions.length === 0) return;

      const currentMode = stats?.mode ?? sessionStats.mode;
      const remaining = stats?.remainingPositions ?? sessionStats.remainingPositions;

      let c: (typeof deck.positions)[0] | null | undefined;

      if (selectedOpeningLine) {
        c = deck.positions[0];
      } else if (currentMode === "full") {
        if (remaining.length > 0) {
          c = deck.positions[remaining[0]];
        } else {
          c = null;
        }
      } else {
        c = getCardForReview(deck.positions);
      }

      if (!c) {
        setPracticeState({ phase: "idle" });
        setPracticePath(null);
        setInvisible(false);
        setShowComments(true);
        setEvalOpen(true);
        return;
      }
      const path = findFen(c.fen, root);
      if (practiceUnit === "line") {
        const selectedLinePath = selectedOpeningLine
          ? findOpeningLinePath(root, selectedOpeningLine.moves)
          : null;
        const linePath = selectedLinePath ? [...selectedLinePath] : [...path];
        let lineEnd = getNodeAtPath(root, linePath);
        while (!selectedOpeningLine && lineEnd.children.length > 0) {
          linePath.push(0);
          lineEnd = lineEnd.children[0];
        }
        const configuredStart = headers.start || [];
        const startIsOnLine = configuredStart.every((value, index) => linePath[index] === value);
        let lineStart = startIsOnLine ? configuredStart : [];
        const startedAt = Date.now();
        const openingVariantId = openingQueue?.variantIds?.[openingQueue.currentIndex];
        const lineMoves = getLineMoves(root, linePath);
        const openingLine =
          selectedOpeningLine ??
          (openingVariantId
            ? trainingAreas.openings.variants[openingVariantId]?.lineIds
                .map((lineId) => trainingAreas.openings.lines[lineId])
                .find(
                  (line) =>
                    line &&
                    line.moves.length === lineMoves.length &&
                    line.moves.every((move, index) => move === lineMoves[index]),
                )
            : undefined);
        if (learning && openingLine) {
          // Replay what earlier learned lines already cover and start teaching at the divergence.
          const studentIsWhite = (headers.orientation || "white") === "white";
          const startPly = openingLearnStartPly(
            learnedOpeningPrefixLength(trainingAreas.openings, openingLine),
            linePath.length,
            (ply) => ((root.halfMoves + ply) % 2 === 0) === studentIsWhite,
          );
          if (startPly > lineStart.length) lineStart = linePath.slice(0, startPly);
        }
        setPracticePath(linePath);
        goToMove(lineStart);
        setInvisible(true);
        setShowComments(learning);
        setEvalOpen(false);
        setCardStartTime(startedAt);
        setPracticeState({
          phase: "waiting",
          currentFen: getNodeAtPath(root, lineStart).fen,
          positionIndex: deck.positions.indexOf(c),
          linePath,
          linePositionIndices: [],
          lineStartedAt: startedAt,
          moveStartedAt: startedAt,
          openingRepertoireId: openingQueue?.repertoireId,
          openingVariantId,
          openingLineId: openingLine?.id,
          mistakes: 0,
          learnStage: learning ? "guided" : undefined,
          learnStep: learning ? "play" : undefined,
          learnShownPly: undefined,
          lineStartPath: lineStart,
        });
        return;
      }
      goToMove(path);
      setPracticePath(path);
      setInvisible(true);
      setShowComments(false);
      setEvalOpen(false);
      setCardStartTime(Date.now());
      setPracticeState({ phase: "waiting", currentFen: c.fen });
    },
    [
      deck.positions,
      sessionStats.mode,
      sessionStats.remainingPositions,
      root,
      goToMove,
      setPracticePath,
      setInvisible,
      setShowComments,
      setEvalOpen,
      setCardStartTime,
      setPracticeState,
      practiceUnit,
      headers.start,
      headers.orientation,
      openingQueue,
      trainingAreas.openings,
      selectedOpeningLine,
      learning,
    ],
  );

  const restartLearnLine = useCallback(
    (stage: "guided" | "recall") => {
      const start = practiceState.lineStartPath ?? [];
      const startedAt = Date.now();
      goToMove(start);
      setPracticeState((previous) => ({
        ...previous,
        phase: "waiting",
        learnStage: stage,
        learnStep: stage === "guided" ? "play" : undefined,
        learnShownPly: undefined,
        currentFen: getNodeAtPath(root, start).fen,
        mistakes: 0,
        feedback: undefined,
        lineStartedAt: startedAt,
        moveStartedAt: startedAt,
      }));
    },
    [goToMove, practiceState.lineStartPath, root, setPracticeState],
  );

  // Guided Learn: show the line move on the board, then return so the student repeats it.
  const startLearnDemo = useCallback(() => {
    const linePath = practiceState.linePath;
    const ply = position.length;
    if (!linePath || ply >= linePath.length) return;
    setPracticeState((previous) => ({
      ...previous,
      learnStep: "demo",
      learnShownPly: ply,
      feedback: undefined,
    }));
    goToMove(linePath.slice(0, ply + 1));
  }, [goToMove, position.length, practiceState.linePath, setPracticeState]);

  const finishLearnDemo = useCallback(() => {
    const linePath = practiceState.linePath;
    const ply = practiceState.learnShownPly;
    if (!linePath || ply === undefined) return;
    goToMove(linePath.slice(0, ply));
    setPracticeState((previous) => ({
      ...previous,
      learnStep: "play",
      moveStartedAt: Date.now(),
      feedback: undefined,
    }));
  }, [goToMove, practiceState.learnShownPly, practiceState.linePath, setPracticeState]);

  // While a move is demonstrated, the student can look at the position before it and back.
  const viewLearnDemoPosition = useCallback(
    (which: "previous" | "shown") => {
      const linePath = practiceState.linePath;
      const ply = practiceState.learnShownPly;
      if (!linePath || ply === undefined || practiceState.learnStep !== "demo") return;
      goToMove(linePath.slice(0, which === "shown" ? ply + 1 : ply));
    },
    [goToMove, practiceState.learnShownPly, practiceState.learnStep, practiceState.linePath],
  );

  const continueGuidedLearn = useCallback(() => {
    if (!learning || practiceState.phase !== "waiting") return;
    if (practiceState.learnStep === "demo") finishLearnDemo();
    else if (practiceState.learnStep === "end") restartLearnLine("recall");
  }, [finishLearnDemo, learning, practiceState.learnStep, practiceState.phase, restartLearnLine]);

  // The demonstrated move and the opponent's move before it, shown together like in Chessable.
  const learnDemo = useMemo(() => {
    const linePath = practiceState.linePath;
    const ply = practiceState.learnShownPly;
    if (!learning || practiceState.learnStep !== "demo" || !linePath || ply === undefined) {
      return null;
    }
    return {
      previous: getNodeAtPath(root, linePath.slice(0, ply)),
      shown: getNodeAtPath(root, linePath.slice(0, ply + 1)),
      viewingPrevious: position.length === ply,
    };
  }, [
    learning,
    position.length,
    practiceState.learnShownPly,
    practiceState.learnStep,
    practiceState.linePath,
    root,
  ]);

  // A demonstrated move only waits for the student when one of the two moves is annotated.
  useEffect(() => {
    if (!learning || practiceState.phase !== "waiting" || practiceState.learnStep !== "demo")
      return;
    const linePath = practiceState.linePath;
    const ply = practiceState.learnShownPly;
    if (!linePath || ply === undefined) return;
    if (
      hasLearnAnnotations(getNodeAtPath(root, linePath.slice(0, ply))) ||
      hasLearnAnnotations(getNodeAtPath(root, linePath.slice(0, ply + 1)))
    )
      return;
    const timer = setTimeout(finishLearnDemo, Math.max(MIN_LEARN_DEMO_MS, learnMoveDelay));
    return () => clearTimeout(timer);
  }, [
    finishLearnDemo,
    learnMoveDelay,
    learning,
    practiceState.learnShownPly,
    practiceState.learnStep,
    practiceState.linePath,
    practiceState.phase,
    root,
  ]);

  useEffect(() => {
    if (practiceUnit !== "line" || practiceState.phase !== "waiting") return;
    const linePath = practiceState.linePath;
    if (!linePath) return;
    const guided = practiceState.learnStage === "guided";
    // Guided pauses (demonstrated move, final position) wait for the student.
    if (guided && (practiceState.learnStep ?? "play") !== "play") return;
    if (position.length >= linePath.length) {
      if (guided) {
        // Keep the final position until the student chooses to repeat the line from memory.
        setPracticeState((previous) => ({ ...previous, learnStep: "end" }));
        return;
      }
      setPracticeState((previous) => ({
        ...previous,
        phase: "correct",
        timeTaken: Date.now() - (previous.lineStartedAt ?? Date.now()),
      }));
      return;
    }

    const orientation = headers.orientation || "white";
    const isUserTurn =
      orientation === "white" ? currentNode.halfMoves % 2 === 0 : currentNode.halfMoves % 2 === 1;
    if (isUserTurn) {
      if (guided && practiceState.learnShownPly !== position.length) {
        // Leave the opponent's reply on the board for a moment before showing the answer; its
        // comment and arrows are shown again next to the demonstrated move.
        const timer = setTimeout(startLearnDemo, currentNode.move ? learnMoveDelay : 0);
        return () => clearTimeout(timer);
      }
      return;
    }
    const timer = setTimeout(() => {
      goToNext();
      setPracticeState((previous) => ({ ...previous, moveStartedAt: Date.now() }));
    }, 350);
    return () => clearTimeout(timer);
  }, [
    currentNode,
    goToNext,
    headers.orientation,
    learnMoveDelay,
    position,
    practiceState.linePath,
    practiceState.learnShownPly,
    practiceState.learnStage,
    practiceState.learnStep,
    practiceState.phase,
    practiceUnit,
    setPracticeState,
    startLearnDemo,
  ]);

  useEffect(() => {
    if (practiceState.phase === "correct") {
      if (practiceUnit === "line") return;
      if (sessionStats.mode === "full") {
        const timer = setTimeout(() => {
          const remainingPositions = sessionStats.remainingPositions.slice(1);
          setSessionStats((prev) => ({
            ...prev,
            remainingPositions,
            correct: prev.correct + 1,
            streak: prev.streak + 1,
            bestStreak: Math.max(prev.bestStreak, prev.streak + 1),
          }));
          newPractice({ remainingPositions, mode: "full" });
        }, 300);
        return () => clearTimeout(timer);
      } else if (practiceAutoDifficulty !== "none" && practiceState.positionIndex !== undefined) {
        const positionIndex = practiceState.positionIndex;
        const timer = setTimeout(() => {
          const card = deck.positions[positionIndex].card;
          const grade = Number(practiceAutoDifficulty) as 1 | 2 | 3 | 4;

          updateCardPerformance(setDeck, positionIndex, card, grade);
          setSessionStats((prev) => ({
            ...prev,
            correct: prev.correct + 1,
            streak: prev.streak + 1,
            bestStreak: Math.max(prev.bestStreak, prev.streak + 1),
          }));
          newPractice();
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [
    practiceState.phase,
    practiceState.positionIndex,
    sessionStats.mode,
    sessionStats.remainingPositions,
    newPractice,
    setSessionStats,
    practiceAutoDifficulty,
    deck.positions,
    setDeck,
    practiceUnit,
  ]);

  const finishOpeningLine = useCallback(
    (grade: 1 | 2 | 3 | 4) => {
      if (practiceState.phase !== "correct") return;
      const indices = practiceState.linePositionIndices ?? [];
      if (indices.length === 0) return;
      updateLinePerformance(setDeck, indices, grade);
      const mistakes = practiceState.mistakes ?? 0;
      const timeTaken = practiceState.timeTaken ?? 0;
      if (practiceState.openingLineId) {
        const lineId = practiceState.openingLineId;
        setFinishedLineId(lineId);
        setTrainingAreas((previous) => ({
          ...previous,
          openings: scheduleOpeningLineReview(
            recordOpeningLineSession(previous.openings, lineId, mistakes, timeTaken),
            lineId,
            grade,
          ),
        }));
      }
      const remainingPositions =
        sessionStats.mode === "full" ? sessionStats.remainingPositions.slice(1) : [];
      setSessionStats((prev) => ({
        ...prev,
        remainingPositions,
        correct: prev.correct + (mistakes === 0 ? 1 : 0),
        incorrect: prev.incorrect + (mistakes > 0 ? 1 : 0),
        streak: mistakes === 0 ? prev.streak + 1 : 0,
        bestStreak: mistakes === 0 ? Math.max(prev.bestStreak, prev.streak + 1) : prev.bestStreak,
      }));
      if (
        sessionStats.mode === "full" &&
        remainingPositions.length === 0 &&
        openingQueue &&
        openingQueue.currentIndex + 1 < openingQueue.gameNumbers.length
      ) {
        void advanceOpeningChapter();
        return;
      }
      newPractice(sessionStats.mode === "full" ? { remainingPositions, mode: "full" } : undefined);
    },
    [
      advanceOpeningChapter,
      newPractice,
      openingQueue,
      practiceState,
      sessionStats.mode,
      sessionStats.remainingPositions,
      setDeck,
      setSessionStats,
      setTrainingAreas,
    ],
  );

  useEffect(() => {
    if (
      practiceUnit !== "line" ||
      learning ||
      practiceState.phase !== "correct" ||
      trainingAreas.openings.settings.askLineDifficulty
    ) {
      return;
    }
    const line = practiceState.openingLineId
      ? trainingAreas.openings.lines[practiceState.openingLineId]
      : undefined;
    const grade = automaticOpeningLineGrade(
      practiceState.mistakes ?? 0,
      practiceState.timeTaken ?? 0,
      line?.plyCount ?? practiceState.linePath?.length ?? 1,
    );
    const timer = setTimeout(() => finishOpeningLine(grade), 550);
    return () => clearTimeout(timer);
  }, [
    finishOpeningLine,
    learning,
    practiceState,
    practiceUnit,
    trainingAreas.openings.lines,
    trainingAreas.openings.settings.askLineDifficulty,
  ]);

  const finishLearnSession = useCallback(() => {
    setLearnFinished(true);
    setPracticeState({ phase: "idle" });
    setPracticePath(null);
    setInvisible(false);
    setShowComments(true);
    setEvalOpen(true);
  }, [setEvalOpen, setInvisible, setPracticePath, setPracticeState, setShowComments]);

  const moveToNextLearnLine = useCallback(() => {
    const hasNext = openingQueue && openingQueue.currentIndex + 1 < openingQueue.gameNumbers.length;
    if (hasNext) void advanceOpeningChapter();
    else finishLearnSession();
  }, [advanceOpeningChapter, finishLearnSession, openingQueue]);

  // A flawless recall marks the line as learned; the final position stays until the student moves on.
  useEffect(() => {
    if (!learning || practiceState.phase !== "correct" || practiceState.learnStage !== "recall") {
      return;
    }
    if ((practiceState.mistakes ?? 0) > 0) return;
    const attemptKey = `${practiceState.openingLineId}:${practiceState.lineStartedAt}`;
    if (learnHandledRef.current === attemptKey) return;
    learnHandledRef.current = attemptKey;
    const lineId = practiceState.openingLineId;
    if (lineId) {
      setTrainingAreas((previous) => ({
        ...previous,
        // The flawless recall counts as the first successful review.
        openings: scheduleOpeningLineReview(
          markOpeningLineLearned(previous.openings, lineId),
          lineId,
          3,
        ),
      }));
    }
    setSessionStats((previous) => ({ ...previous, correct: previous.correct + 1 }));
  }, [
    learning,
    practiceState.learnStage,
    practiceState.lineStartedAt,
    practiceState.mistakes,
    practiceState.openingLineId,
    practiceState.phase,
    setSessionStats,
    setTrainingAreas,
  ]);

  function handleQualityRating(grade: 1 | 2 | 3 | 4) {
    if (practiceState.phase !== "correct" || practiceState.positionIndex === undefined) return;

    if (practiceUnit === "line") {
      finishOpeningLine(grade);
      return;
    }

    const { positionIndex } = practiceState;
    const card = deck.positions[positionIndex].card;

    updateCardPerformance(setDeck, positionIndex, card, grade);
    setSessionStats((prev) => ({
      ...prev,
      correct: prev.correct + 1,
      streak: prev.streak + 1,
      bestStreak: Math.max(prev.bestStreak, prev.streak + 1),
    }));
    newPractice();
  }

  function startPractice() {
    const stats: Partial<PracticeSessionStats> = {
      mode: "anki",
      remainingPositions: [],
      correct: 0,
      incorrect: 0,
      streak: 0,
      bestStreak: 0,
    };
    setSessionStats((prev) => ({ ...prev, ...stats }));
    newPractice(stats);
  }

  function startFullPractice() {
    setLearnFinished(false);
    const indices = selectedOpeningLine
      ? [0]
      : practiceUnit === "line"
        ? getLineRepresentativeIndices(root, deck.positions)
        : deck.positions.map((_, i) => i);
    const stats: Partial<PracticeSessionStats> = {
      mode: "full",
      remainingPositions: indices,
      correct: 0,
      incorrect: 0,
      streak: 0,
      bestStreak: 0,
    };
    setSessionStats((prev) => ({ ...prev, ...stats }));
    newPractice(stats);
  }

  function showExpectedOpeningMove() {
    if (
      practiceUnit !== "line" ||
      (practiceState.phase !== "waiting" && practiceState.phase !== "incorrect")
    )
      return;
    const alreadyIncorrect = practiceState.phase === "incorrect";
    const linePath = practiceState.linePath;
    if (!linePath || position.length >= linePath.length) return;
    const orientation = headers.orientation || "white";
    const isUserTurn =
      orientation === "white" ? currentNode.halfMoves % 2 === 0 : currentNode.halfMoves % 2 === 1;
    if (!isUserTurn) return;
    const expectedChildIndex = linePath[position.length];
    const expectedMove = currentNode.children[expectedChildIndex];
    const expectedSan = expectedMove?.san;
    if (!expectedMove || !expectedSan) return;

    const currentPath = [...position];
    const positionIndex = deck.positions.findIndex((card) => card.fen === currentNode.fen);
    const linePositionIndices = Array.from(
      new Set([
        ...(practiceState.linePositionIndices ?? []),
        ...(positionIndex >= 0 ? [positionIndex] : []),
      ]),
    );
    const timeTaken = Date.now() - (practiceState.moveStartedAt ?? Date.now());
    if (practiceState.openingLineId && !alreadyIncorrect && !learning) {
      const lineId = practiceState.openingLineId;
      setTrainingAreas((previous) => ({
        ...previous,
        openings: recordOpeningMoveAttempt(
          previous.openings,
          lineId,
          position.length,
          false,
          timeTaken,
        ),
      }));
    }

    setPracticeState((previous) => ({
      ...previous,
      phase: "revealing",
      answer: expectedSan,
      positionIndex: positionIndex >= 0 ? positionIndex : previous.positionIndex,
      linePositionIndices,
      mistakes: (previous.mistakes ?? 0) + (alreadyIncorrect ? 0 : 1),
      timeTaken: alreadyIncorrect ? previous.timeTaken : timeTaken,
    }));
    goToMove([...currentPath, expectedChildIndex]);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      goToMove(currentPath);
      setPracticeState((previous) => ({
        ...previous,
        phase: "waiting",
        currentFen: getNodeAtPath(root, currentPath).fen,
        moveStartedAt: Date.now(),
        feedback: undefined,
      }));
      revealTimerRef.current = null;
    }, 1100);
  }

  useEffect(() => {
    if (!pendingChapterStart || deck.positions.length === 0) return;
    const remainingPositions = getLineRepresentativeIndices(root, deck.positions);
    const stats: Partial<PracticeSessionStats> = { mode: "full", remainingPositions };
    setPendingChapterStart(false);
    setSessionStats((previous) => ({ ...previous, ...stats }));
    newPractice(stats);
  }, [deck.positions, newPractice, pendingChapterStart, root, setSessionStats]);

  function skipCard() {
    if (sessionStats.mode === "full" && sessionStats.remainingPositions.length > 0) {
      const remainingPositions = sessionStats.remainingPositions.slice(1);
      setSessionStats((prev) => ({ ...prev, remainingPositions }));
      newPractice({ remainingPositions });
    } else {
      newPractice();
    }
  }

  function continueAfterDeviation() {
    goToNext();
    setPracticeState((previous) => ({
      ...previous,
      phase: "waiting",
      moveStartedAt: Date.now(),
    }));
  }

  function retryOpeningMove() {
    setPracticeState((previous) => ({
      ...previous,
      phase: "waiting",
      feedback: undefined,
      moveStartedAt: Date.now(),
    }));
  }

  function returnToOpenings() {
    const target = openingQueue?.returnTarget;
    if (target?.view === "manage") {
      void navigate({ to: "/training/openings/manage" });
    } else if (target?.view === "section") {
      void navigate({
        to: "/training/openings/$repertoireId/$variantId",
        params: { repertoireId: target.repertoireId, variantId: target.variantId },
      });
    } else if (target?.view === "repertoire") {
      void navigate({
        to: "/training/openings/$repertoireId",
        params: { repertoireId: target.repertoireId },
      });
    } else {
      void navigate({ to: "/training/openings" });
    }
  }

  useHotkeys("1", () => handleQualityRating(1), {
    enabled:
      practiceState.phase === "correct" &&
      (practiceUnit !== "line" || trainingAreas.openings.settings.askLineDifficulty),
  });
  useHotkeys("2", () => handleQualityRating(2), {
    enabled:
      practiceState.phase === "correct" &&
      (practiceUnit !== "line" || trainingAreas.openings.settings.askLineDifficulty),
  });
  useHotkeys("3", () => handleQualityRating(3), {
    enabled:
      practiceState.phase === "correct" &&
      (practiceUnit !== "line" || trainingAreas.openings.settings.askLineDifficulty),
  });
  useHotkeys("4", () => handleQualityRating(4), {
    enabled:
      practiceState.phase === "correct" &&
      (practiceUnit !== "line" || trainingAreas.openings.settings.askLineDifficulty),
  });
  useHotkeys("enter, space", () => continueGuidedLearn(), {
    enabled:
      learning &&
      practiceState.phase === "waiting" &&
      practiceState.learnStage === "guided" &&
      (practiceState.learnStep ?? "play") !== "play",
    preventDefault: true,
  });
  useHotkeys(
    "enter, space",
    () => {
      if ((practiceState.mistakes ?? 0) === 0) moveToNextLearnLine();
    },
    {
      enabled:
        learning && practiceState.phase === "correct" && practiceState.learnStage === "recall",
      preventDefault: true,
    },
  );
  useHotkeys("enter, space", () => continueAfterDeviation(), {
    enabled: practiceState.phase === "deviation" && practiceUnit === "line",
    preventDefault: true,
  });
  useHotkeys("space", () => skipCard(), {
    enabled: practiceState.phase === "incorrect" && practiceUnit !== "line",
  });

  const [positionsOpen, setPositionsOpen] = useToggle();
  const [logsOpen, setLogsOpen] = useToggle();
  const [tab, setTab] = useAtom(currentPracticeTabAtom);

  return (
    <>
      <Tabs
        h="100%"
        orientation="vertical"
        placement="right"
        value={tab}
        onChange={(v) => setTab(v!)}
        style={{
          display: "flex",
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="train">{t("Board.Practice.Train")}</Tabs.Tab>
          <Tabs.Tab value="build">{t("Board.Practice.Build")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="train" style={{ overflow: "hidden", flex: 1, minHeight: 0 }}>
          <ScrollArea h="100%" type="auto" offsetScrollbars>
            <Stack p="sm" gap="md" pr="md">
              {stats.total === 0 && (
                <Alert icon={<IconInfoCircle />}>
                  <Stack gap="xs">
                    <Text fz="sm">{t("Board.Practice.NoPositionForTrain1")}</Text>
                    <Button variant="light" size="xs" onClick={() => setTab("build")}>
                      {t("Board.Practice.GoToBuild")}
                    </Button>
                  </Stack>
                </Alert>
              )}
              {syncMessage && (
                <Alert
                  title={t("Board.Practice.DeckSynced")}
                  withCloseButton
                  onClose={() => setSyncMessage(null)}
                >
                  {syncMessage.added > 0 &&
                    t("Board.Practice.SyncAdded", {
                      count: syncMessage.added ?? 0,
                      number: formatNumber(syncMessage.added ?? 0),
                    })}
                  {syncMessage.added > 0 && syncMessage.removed > 0 && " · "}
                  {syncMessage.removed > 0 &&
                    t("Board.Practice.SyncRemoved", {
                      count: syncMessage.removed ?? 0,
                      number: formatNumber(syncMessage.removed ?? 0),
                    })}
                </Alert>
              )}
              {stats.total > 0 && (
                <>
                  {openingQueue && (
                    <Alert color={learning ? "grape" : "blue"} variant="light">
                      {learning && selectedOpeningLine
                        ? t(
                            "OpeningLearn.SessionHeader",
                            "Learn session · line {{index}} of {{total}} · {{name}}",
                            {
                              index: openingQueue.currentIndex + 1,
                              total: openingQueue.gameNumbers.length,
                              name: selectedOpeningLine.name,
                            },
                          )
                        : selectedOpeningLine
                          ? openingQueue && openingQueue.gameNumbers.length > 1
                            ? t(
                                "Training.Copy.Repertoiresessionlinev0of.c3a4ec82",
                                "Repertoire session · line {{v0}} of {{v1}} · {{v2}}.",
                                {
                                  v0: openingQueue.currentIndex + 1,
                                  v1: openingQueue.gameNumbers.length,
                                  v2: selectedOpeningLine.name,
                                },
                              )
                            : t(
                                "Training.Copy.Individualpracticev0Repeatthis.a8750c13",
                                "Individual practice · {{v0}}. Repeat this line as often as you like.",
                                { v0: selectedOpeningLine.name },
                              )
                          : t(
                              "Training.Copy.Repertoiresessionchapterv0of.22d7688c",
                              "Repertoire session · chapter {{v0}} of {{v1}}. Finishing all lines opens the next trainable chapter.",
                              {
                                v0: openingQueue.currentIndex + 1,
                                v1: openingQueue.gameNumbers.length,
                              },
                            )}
                    </Alert>
                  )}
                  {practiceUnit === "line" && (
                    <Button
                      variant="subtle"
                      size="xs"
                      leftSection={<IconArrowLeft size={14} />}
                      onClick={returnToOpenings}
                    >
                      {" "}
                      {t("Training.Copy.Backtoopenings.3aa15245", "Back to openings")}{" "}
                    </Button>
                  )}
                  {!learning && (
                    <PracticeProgressSummary
                      stats={stats}
                      sessionStats={sessionStats}
                      showSession={
                        practiceState.phase !== "idle" ||
                        sessionStats.correct > 0 ||
                        sessionStats.incorrect > 0
                      }
                    />
                  )}

                  {practiceState.phase === "idle" &&
                    learning &&
                    (learnFinished ? (
                      <Alert
                        color="teal"
                        icon={<IconCheck size={16} />}
                        title={t("OpeningLearn.SessionDone", "Learn session completed")}
                      >
                        {t(
                          "OpeningLearn.SessionDoneBody",
                          "Lines learned in this session: {{count}}. They are now included when you train this repertoire.",
                          { count: sessionStats.correct },
                        )}
                        {learnedSessionLines.length > 0 && (
                          <Button
                            mt="xs"
                            size="compact-sm"
                            variant="light"
                            color="teal"
                            leftSection={<IconBook size={14} />}
                            onClick={() => startOpeningLines(learnedSessionLines, "practice")}
                          >
                            {learnedSessionLines.length === 1
                              ? t("OpeningNext.TrainLearned", "Train this line")
                              : t("OpeningNext.TrainLearnedLines", "Train these lines")}
                          </Button>
                        )}
                      </Alert>
                    ) : (
                      <Button
                        size="md"
                        variant="light"
                        color="grape"
                        fullWidth
                        onClick={startFullPractice}
                        leftSection={<IconSchool size={20} />}
                      >
                        {t("OpeningLearn.Start", "Start learning")}
                      </Button>
                    ))}

                  {nextLine &&
                    atLastQueueLine &&
                    (learning
                      ? learnFinished
                      : !!finishedLineId && finishedLineId === selectedOpeningLineId) && (
                      <Paper withBorder p="sm">
                        <Stack gap="xs">
                          <Text size="sm">
                            {t("OpeningNext.Title", "Next line of the repertoire: {{name}}", {
                              name: nextLine.name,
                            })}
                          </Text>
                          {isOpeningLineLearned(nextLine) ? (
                            <Button
                              variant="light"
                              leftSection={<IconBook size={16} />}
                              rightSection={<IconArrowRight size={16} />}
                              onClick={() => startOpeningLines([nextLine], "practice")}
                            >
                              {t("OpeningNext.Train", "Train next line")}
                            </Button>
                          ) : (
                            <Button
                              variant="light"
                              color="grape"
                              leftSection={<IconSchool size={16} />}
                              rightSection={<IconArrowRight size={16} />}
                              onClick={() => startOpeningLines([nextLine], "learn")}
                            >
                              {t("OpeningNext.Learn", "Learn next line")}
                            </Button>
                          )}
                        </Stack>
                      </Paper>
                    )}

                  {practiceState.phase === "idle" && !learning && (
                    <Stack gap="sm">
                      {selectedOpeningLine ? (
                        <Button
                          size="md"
                          variant="light"
                          fullWidth
                          onClick={startFullPractice}
                          leftSection={<IconBook size={20} />}
                        >
                          {" "}
                          {t("Training.Copy.Practicethisline.f35e404a", "Practice this line")}{" "}
                        </Button>
                      ) : stats.due === 0 && stats.unseen === 0 ? (
                        <Paper p="sm" withBorder>
                          <Stack gap="xs" align="center">
                            <ThemeIcon size="xl" radius="xl" color="green" variant="light">
                              <IconCheck size={24} />
                            </ThemeIcon>
                            <Text ta="center" fw={500}>
                              {t("Board.Practice.PracticedAll1")}
                            </Text>
                            <Text ta="center" fz="sm" c="dimmed">
                              {t("Board.Practice.PracticedAll2")}{" "}
                              {dayjs(stats.nextDue).format("MMM D, HH:mm")}
                            </Text>
                          </Stack>
                        </Paper>
                      ) : (
                        <Button
                          size="md"
                          variant="light"
                          fullWidth
                          onClick={startPractice}
                          leftSection={<IconTarget size={20} />}
                          justify="space-between"
                          rightSection={
                            <Badge size="sm" variant="white" color="blue">
                              {stats.due + stats.unseen}
                            </Badge>
                          }
                        >
                          {t("Board.Practice.StartPractice")}
                        </Button>
                      )}
                      {!selectedOpeningLine && (
                        <Button
                          size="md"
                          variant="light"
                          color="gray"
                          fullWidth
                          onClick={startFullPractice}
                          leftSection={<IconBook size={20} />}
                          justify="space-between"
                          rightSection={
                            <Badge size="sm" variant="white" color="gray">
                              {deck.positions.length}
                            </Badge>
                          }
                        >
                          {t("Board.Practice.PracticeFullRepertoire")}
                        </Button>
                      )}
                    </Stack>
                  )}

                  {learning &&
                  (practiceState.phase === "waiting" || practiceState.phase === "correct") ? (
                    <OpeningLearnFeedback
                      practiceState={practiceState}
                      comment={currentNode.comment}
                      demo={learnDemo}
                      onViewDemoPosition={viewLearnDemoPosition}
                      hasNextLine={
                        !!openingQueue &&
                        openingQueue.currentIndex + 1 < openingQueue.gameNumbers.length
                      }
                      onContinue={continueGuidedLearn}
                      onNextLine={moveToNextLearnLine}
                      onRestartGuided={() => restartLearnLine("guided")}
                      onRestartRecall={() => restartLearnLine("recall")}
                      onSkip={moveToNextLearnLine}
                    />
                  ) : (
                    practiceUnit === "line" && (
                      <OpeningLineFeedback
                        practiceState={practiceState}
                        askLineDifficulty={trainingAreas.openings.settings.askLineDifficulty}
                        onShowMove={showExpectedOpeningMove}
                        onRetry={retryOpeningMove}
                        onContinueDeviation={continueAfterDeviation}
                      />
                    )
                  )}

                  {practiceState.phase === "waiting" && (
                    <Stack gap="xs">
                      <Paper p="sm" withBorder>
                        {practiceUnit !== "line" &&
                        practiceState.currentFen &&
                        currentFen !== practiceState.currentFen ? (
                          <Stack gap="xs" align="center">
                            <Text ta="center" fz="sm" c="dimmed">
                              {t("Board.Practice.NotOnPosition")}
                            </Text>
                            <Button
                              variant="light"
                              size="xs"
                              leftSection={<IconArrowBack size={14} />}
                              onClick={() => {
                                goToMove(findFen(practiceState.currentFen!, root));
                                setInvisible(true);
                              }}
                            >
                              {t("Board.Practice.GoBackToPosition")}
                            </Button>
                          </Stack>
                        ) : (
                          <Stack gap="xs" align="center">
                            {(practiceState.learnStage !== "guided" ||
                              (practiceState.learnStep ?? "play") === "play") && (
                              <Text ta="center" fz="sm" c="dimmed">
                                {t("Board.Practice.MakeYourMove")}
                              </Text>
                            )}
                            <Group gap="xs" justify="center">
                              {practiceUnit === "line" && practiceState.learnStage !== "guided" && (
                                <Button
                                  variant="light"
                                  size="compact-xs"
                                  leftSection={<IconEye size={14} />}
                                  onClick={showExpectedOpeningMove}
                                >
                                  {" "}
                                  {t("Training.Copy.Showmove.940e6364", "Show move")}{" "}
                                </Button>
                              )}
                              <Button
                                variant="light"
                                size="compact-xs"
                                color="red"
                                onClick={() => {
                                  setPracticeState({ phase: "idle" });
                                  setPracticePath(null);
                                  setInvisible(false);
                                  setShowComments(true);
                                  setEvalOpen(true);
                                  setSessionStats({
                                    mode: "anki",
                                    remainingPositions: [],
                                    correct: 0,
                                    incorrect: 0,
                                    streak: 0,
                                    bestStreak: 0,
                                  });
                                }}
                              >
                                {t("Common.Stop")}
                              </Button>
                            </Group>
                          </Stack>
                        )}
                      </Paper>
                    </Stack>
                  )}

                  {practiceState.phase === "correct" &&
                    (practiceUnit === "line" || sessionStats.mode !== "full") && (
                      <Stack gap="xs">
                        {(practiceUnit !== "line" ||
                          (!learning && trainingAreas.openings.settings.askLineDifficulty)) && (
                          <QualityRatingPanel
                            onRate={handleQualityRating}
                            card={
                              practiceUnit === "line" &&
                              (practiceState.linePositionIndices?.length ?? 0) > 0
                                ? deck.positions[practiceState.linePositionIndices![0]].card
                                : practiceState.positionIndex !== undefined
                                  ? deck.positions[practiceState.positionIndex].card
                                  : undefined
                            }
                            timeTaken={practiceState.timeTaken}
                          />
                        )}
                      </Stack>
                    )}

                  {practiceState.phase === "incorrect" && practiceUnit !== "line" && (
                    <Paper p="sm" withBorder>
                      <Stack gap="xs" align="center">
                        <Group gap="xs">
                          <ThemeIcon size="md" color="red" variant="light" radius="xl">
                            <IconX size={16} />
                          </ThemeIcon>
                          <Text fw={500} c="red">
                            {t("Common.Incorrect")}
                          </Text>
                        </Group>
                        <Text fz="sm" c="dimmed">
                          {t("Board.Practice.CorrectMoveWas", {
                            move: practiceState.answer,
                          })}
                        </Text>
                        <Button variant="light" size="sm" onClick={skipCard}>
                          {t("Board.Practice.NextPosition")}
                        </Button>
                      </Stack>
                    </Paper>
                  )}

                  <Divider />

                  <Group gap="xs">
                    <Button variant="subtle" size="xs" onClick={() => setPositionsOpen(true)}>
                      {t("Board.Practice.ShowAll")}
                    </Button>
                    <Button variant="subtle" size="xs" onClick={() => setLogsOpen(true)}>
                      {t("Board.Practice.ShowLogs")}
                    </Button>
                    <Button
                      variant="subtle"
                      size="xs"
                      color="red"
                      onClick={() => toggleResetModal()}
                    >
                      {t("Common.Reset")}
                    </Button>
                  </Group>
                </>
              )}
            </Stack>
          </ScrollArea>
        </Tabs.Panel>

        <Tabs.Panel value="build" style={{ overflow: "hidden", flex: 1, minHeight: 0 }}>
          {tab === "build" && <RepertoireInfo saveFile={saveFile} />}
        </Tabs.Panel>
      </Tabs>

      <ConfirmModal
        title={t("Board.Practice.Reset.Title")}
        description={t("Board.Practice.Reset.Description", {
          name: tabFile?.name,
        })}
        opened={resetModal}
        onClose={toggleResetModal}
        onConfirm={() => {
          const cards = buildFromTree(root, headers.orientation || "white", headers.start || []);
          setDeck({ positions: cards, logs: [] });
          setPracticeState({ phase: "idle" });
          setPracticePath(null);
          setInvisible(false);
          setShowComments(true);
          setEvalOpen(true);
          setSessionStats({
            mode: "anki",
            remainingPositions: [],
            correct: 0,
            incorrect: 0,
            streak: 0,
            bestStreak: 0,
          });
          toggleResetModal();
        }}
        confirmLabel={t("Common.Reset")}
      />
      {positionsOpen && (
        <PositionsModal open={positionsOpen} setOpen={setPositionsOpen} deck={deck} />
      )}
      <LogsModal open={logsOpen} setOpen={setLogsOpen} logs={deck.logs} />
    </>
  );
}

export default PracticePanel;
