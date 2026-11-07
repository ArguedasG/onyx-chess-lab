import { useTranslation as useTrainingTranslation } from "react-i18next";
import i18n from "i18next";
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Card,
  Code,
  Container,
  Group,
  Menu,
  NumberInput,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconDatabase,
  IconDots,
  IconDownload,
  IconEye,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconPencil,
  IconPlayerPlay,
  IconPuzzle,
  IconSettings,
  IconTrash,
  IconUnlink,
  IconUpload,
  IconWand,
} from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PuzzleDatabaseInfo } from "@/bindings";
import Board from "@/components/boards/Board";
import { TreeStateProvider } from "@/components/common/TreeStateContext";
import TacticsSetStatisticsModal from "@/components/training/TacticsSetStatisticsModal";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { usePendingPgnImport } from "@/hooks/usePendingPgnImport";
import PendingPgnNotice from "../files/PendingPgnNotice";
import { getPuzzleDatabases } from "@/utils/puzzles";
import { useTacticsReview } from "@/state/tacticsReview";
import { addPuzzleSet, recentSetStats } from "@/utils/puzzleSets";
import { PROVISIONAL_DEVIATION, ratingBandFor } from "@/utils/tacticsRating";
import {
  dueTacticsReview,
  recordTacticsReview,
  type TacticsReviewItem,
} from "@/utils/tacticsReview";
import AddPuzzle from "../puzzles/AddPuzzle";
import PuzzleSetBuilder from "./tactics/PuzzleSetBuilder";
import TacticsProgressCards from "./tactics/TacticsProgressCards";
import TacticsReviewSession from "./tactics/TacticsReviewSession";
import TacticsCourseImport, { type TacticsCourseScan } from "./tactics/TacticsCourseImport";
import CourseMixSession from "./tactics/CourseMixSession";
import CourseSetsPicker, { type CoursePickerMode } from "./tactics/CourseSetsPicker";
import {
  addSetsToTacticsCourse,
  addTacticsFileSet,
  deleteTacticsCourse,
  deleteTacticsSet,
  getTacticsCompletedIndexes,
  getTacticsCourseProgress,
  getTacticsFirstIncompleteIndex,
  getTacticsSetProgress,
  groupTacticsSetsByCourse,
  moveTacticsSetInCourse,
  nextTacticsCourseSet,
  renameTacticsCourse,
  setTacticsSetCourse,
  ungroupTacticsCourse,
  updateTacticsSetConfig,
  updateTacticsSetMetadata,
  type TacticsSet,
} from "@/utils/trainingAreas";
import {
  inspectTacticsPgn,
  loadTacticsExercise,
  scanTacticsCourseFolder,
  type TacticsCourseFile,
  type TacticsLoadedExercise,
  type TacticsPgnInspection,
} from "@/utils/tacticsTraining";
import { createTab } from "@/utils/tabs";
import { defaultTree } from "@/utils/treeReducer";

const defaultConfig: TacticsSet["config"] = {
  acceptanceThresholdCp: 30,
  mode: "guided",
  startingActor: "student",
  variationPolicy: "opponentResponses",
  validationMode: "auto",
};

/** The course open on the dashboard; kept while visiting a set's session and coming back. */
const openCourseAtom = atom<string | null>(null);

function filename(path: string, trainingT: typeof i18n.t = i18n.t) {
  return (
    path
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, "") || trainingT("Training.Copy.Tacticsset.e9b5f38c", "Tactics set")
  );
}

function numericRating(value: string | number): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function ratingLabel(set: TacticsSet, trainingT: typeof i18n.t = i18n.t) {
  const { min, max } = set.recommendedRating;
  if (min !== null && max !== null) return `${min}–${max} ELO`;
  if (min !== null)
    return trainingT("Training.Copy.Fromv0ELO.92be5507", "From {{v0}} ELO", { v0: min });
  if (max !== null)
    return trainingT("Training.Copy.Uptov0ELO.249acac4", "Up to {{v0}} ELO", { v0: max });
  return trainingT("Training.Copy.Alllevels.268b96a8", "All levels");
}

export default function TacticsDashboardV2Page() {
  const { t: trainingT } = useTrainingTranslation();

  const navigate = useNavigate();
  const [areas, setAreas] = useAtom(trainingAreasAtom);
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);
  const [feedback, setFeedback] = useState<{ text: string; color?: string } | null>(null);
  const [puzzleDbs, setPuzzleDbs] = useState<PuzzleDatabaseInfo[]>([]);

  const [setName, setSetName] = useState("");
  const [description, setDescription] = useState("");
  const [ratingMin, setRatingMin] = useState<string | number>("");
  const [ratingMax, setRatingMax] = useState<string | number>("");
  const [draftConfig, setDraftConfig] = useState<TacticsSet["config"]>(defaultConfig);
  const [inspection, setInspection] = useState<TacticsPgnInspection | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const pendingImport = usePendingPgnImport("tactics");
  const importCardRef = useRef<HTMLDivElement>(null);

  // A PGN sent from Files: bring the import form into view and suggest a set name.
  useEffect(() => {
    const path = pendingImport.path;
    if (!path) return;
    setSetName((current) => current || filename(path, trainingT));
    const frame = requestAnimationFrame(() =>
      importCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [pendingImport.path, trainingT]);

  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftRatingMin, setDraftRatingMin] = useState<string | number>("");
  const [draftRatingMax, setDraftRatingMax] = useState<string | number>("");
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);
  const [statisticsSetId, setStatisticsSetId] = useState<string | null>(null);

  const [reviewSetId, setReviewSetId] = useState<string | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewExercise, setReviewExercise] = useState<TacticsLoadedExercise | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewView, setReviewView] = useState<"list" | "detail">("list");
  const reviewListViewportRef = useRef<HTMLDivElement>(null);
  const { state: tacticsReview, update: updateTacticsReview } = useTacticsReview();
  const [reviewSessionItems, setReviewSessionItems] = useState<TacticsReviewItem[] | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [addPuzzleDbOpen, setAddPuzzleDbOpen] = useState(false);
  const [openCourse, setOpenCourse] = useAtom(openCourseAtom);
  const [courseScan, setCourseScan] = useState<TacticsCourseScan | null>(null);
  const [courseBusy, setCourseBusy] = useState(false);
  const [courseAction, setCourseAction] = useState<{
    kind: "rename" | "ungroup" | "delete";
    name: string;
  } | null>(null);
  const [courseRename, setCourseRename] = useState("");
  const [draftCourse, setDraftCourse] = useState("");
  const [mixCourseName, setMixCourseName] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<CoursePickerMode | null>(null);
  const [movingSetId, setMovingSetId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const myLevel =
    tacticsReview && tacticsReview.rating.deviation < PROVISIONAL_DEVIATION
      ? ratingBandFor(tacticsReview.rating)
      : null;

  const sets = useMemo(
    () =>
      Object.values(areas.tactics.sets).sort((a, b) => {
        if (a.origin !== b.origin) return a.origin === "bundled" ? -1 : 1;
        return a.createdAt.localeCompare(b.createdAt);
      }),
    [areas.tactics.sets],
  );
  const { courses, loose: looseSets } = useMemo(() => groupTacticsSetsByCourse(sets), [sets]);
  const activeCourse = openCourse
    ? courses.find((course) => course.name === openCourse)
    : undefined;
  const courseNames = courses.map((course) => course.name);
  // A course emptied (its last set removed or moved) closes its view.
  useEffect(() => {
    // Not while the stored sets are still loading (the list is empty then).
    if (openCourse && !activeCourse && sets.length > 0) setOpenCourse(null);
  }, [activeCourse, openCourse, setOpenCourse, sets.length]);
  const mixCourse = mixCourseName
    ? (courses.find((course) => course.name === mixCourseName) ?? null)
    : null;
  const nextCourseSet = activeCourse ? nextTacticsCourseSet(areas.tactics, activeCourse) : null;
  const movingSet = movingSetId ? areas.tactics.sets[movingSetId] : undefined;
  const activeCourseProgress = activeCourse
    ? getTacticsCourseProgress(areas.tactics, activeCourse)
    : null;
  const reviewSet = reviewSetId ? areas.tactics.sets[reviewSetId] : undefined;
  const statisticsSet = statisticsSetId ? areas.tactics.sets[statisticsSetId] : undefined;
  const reviewTotal = reviewSet
    ? reviewSet.source?.kind === "pgnFile"
      ? reviewSet.source.recordCount
      : reviewSet.exerciseIds.length
    : 0;
  const reviewCycleNumber = reviewSet
    ? (reviewSet.progress.activeCycle?.number ?? reviewSet.progress.cycles.at(-1)?.number ?? 1)
    : null;
  const reviewCompletedIndexes = useMemo(
    () =>
      reviewSetId
        ? getTacticsCompletedIndexes(
            areas.tactics,
            reviewSetId,
            reviewSet?.config.mode === "woodpecker" ? reviewCycleNumber : null,
          )
        : [],
    [areas.tactics, reviewCycleNumber, reviewSet?.config.mode, reviewSetId],
  );
  const reviewCompletedSet = useMemo(
    () => new Set(reviewCompletedIndexes),
    [reviewCompletedIndexes],
  );
  const reviewListVirtualizer = useVirtualizer({
    count: reviewSetId && reviewView === "list" ? reviewTotal : 0,
    getScrollElement: () => reviewListViewportRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  useEffect(() => {
    void getPuzzleDatabases()
      .then(setPuzzleDbs)
      .catch(() => setPuzzleDbs([]));
  }, []);

  useEffect(() => {
    if (!reviewSet || reviewTotal === 0 || reviewView !== "detail") {
      setReviewExercise(null);
      return;
    }
    let cancelled = false;
    const safeIndex = Math.min(Math.max(0, reviewIndex), reviewTotal - 1);
    setReviewLoading(true);
    setReviewError("");
    void loadTacticsExercise(reviewSet, areas.tactics.exercises, safeIndex)
      .then((exercise) => !cancelled && setReviewExercise(exercise))
      .catch((error) => {
        if (!cancelled) {
          setReviewExercise(null);
          setReviewError(
            error instanceof Error
              ? error.message
              : trainingT(
                  "Training.Copy.Couldnotreadthepuzzle.3ad5e4a1",
                  "Could not read the puzzle.",
                ),
          );
        }
      })
      .finally(() => !cancelled && setReviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [areas.tactics.exercises, reviewIndex, reviewSet, reviewTotal, reviewView, trainingT]);

  function ratingRange(minValue: string | number, maxValue: string | number) {
    const min = numericRating(minValue);
    const max = numericRating(maxValue);
    if (min !== null && max !== null && min > max) {
      setFeedback({
        text: trainingT(
          "Training.Copy.MinimumELOcannotexceedmaximum.c30da85b",
          "Minimum ELO cannot exceed maximum ELO.",
        ),
        color: "red",
      });
      return null;
    }
    return { min, max };
  }

  async function openLichessTrainer() {
    await navigate({ to: "/" });
    await createTab({
      tab: {
        name: trainingT("Training.Copy.Tacticstraining.8816b222", "Tactics training"),
        type: "puzzles",
      },
      setTabs,
      setActiveTab,
    });
  }

  async function selectImportFile() {
    const selected = await pendingImport.choosePath([
      { name: trainingT("Training.Copy.TacticsPGN.2840fe24", "Tactics PGN"), extensions: ["pgn"] },
    ]);
    if (!selected) return;
    setImportBusy(true);
    setFeedback(null);
    try {
      const next = await inspectTacticsPgn(selected, draftConfig);
      if (next.recordCount === 0)
        throw new Error(
          trainingT(
            "Training.Copy.ThefilecontainsnoPGN.40a99062",
            "The file contains no PGN exercises.",
          ),
        );
      setInspection(next);
      if (!setName.trim()) setSetName(filename(selected, trainingT));
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : trainingT(
                "Training.Copy.CouldnotinspectthePGN.dc19e21b",
                "Could not inspect the PGN.",
              ),
        color: "red",
      });
    } finally {
      setImportBusy(false);
    }
  }

  function confirmImport() {
    if (!inspection) return;
    const recommendedRating = ratingRange(ratingMin, ratingMax);
    if (!recommendedRating) return;
    const name = setName.trim() || filename(inspection.path, trainingT);
    setAreas((previous) => ({
      ...previous,
      tactics: addTacticsFileSet(previous.tactics, {
        name,
        description: description.trim(),
        path: inspection.path,
        filename: inspection.filename,
        recordCount: inspection.recordCount,
        config: draftConfig,
        recommendedRating,
      }),
    }));
    setInspection(null);
    setSetName("");
    setDescription("");
    setRatingMin("");
    setRatingMax("");
    setDraftConfig(defaultConfig);
    setFeedback({
      text: trainingT(
        "Training.Copy.Setv0addedwithv1.f3488bc5",
        "Set “{{v0}}” added with {{v1}} puzzles.",
        { v0: name, v1: inspection.recordCount.toLocaleString() },
      ),
    });
  }

  function editSet(set: TacticsSet) {
    setEditingSetId(set.id);
    setDraftName(set.name);
    setDraftDescription(set.description);
    setDraftRatingMin(set.recommendedRating.min ?? "");
    setDraftRatingMax(set.recommendedRating.max ?? "");
    setDraftCourse(set.course?.name ?? "");
    setDraftConfig(set.config);
  }

  function saveSettings() {
    if (!editingSetId || !draftName.trim()) return;
    const recommendedRating = ratingRange(draftRatingMin, draftRatingMax);
    if (!recommendedRating) return;
    setAreas((previous) => {
      const configured = updateTacticsSetConfig(previous.tactics, editingSetId, draftConfig);
      const described = updateTacticsSetMetadata(configured, editingSetId, {
        name: draftName,
        description: draftDescription,
        recommendedRating,
      });
      return {
        ...previous,
        tactics: setTacticsSetCourse(described, editingSetId, draftCourse),
      };
    });
    setEditingSetId(null);
  }

  function removeSet() {
    if (!deletingSetId) return;
    const set = areas.tactics.sets[deletingSetId];
    if (!set) return;
    setAreas((previous) => ({
      ...previous,
      tactics: deleteTacticsSet(previous.tactics, deletingSetId),
    }));
    setDeletingSetId(null);
    setFeedback({
      text: trainingT(
        "Training.Copy.Setv0removedItsPGN.42a87794",
        "Set “{{v0}}” removed. Its PGN file was not deleted.",
        { v0: set.name },
      ),
    });
  }

  async function selectCourseFolder() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected !== "string") return;
    setCourseBusy(true);
    setFeedback(null);
    try {
      const scan = await scanTacticsCourseFolder(selected);
      setDraftConfig(defaultConfig);
      setCourseScan({ directory: selected, ...scan });
    } catch (error) {
      setFeedback({
        text:
          error instanceof Error
            ? error.message
            : trainingT("Tactics.Course.ReadError", "Could not read the folder."),
        color: "red",
      });
    } finally {
      setCourseBusy(false);
    }
  }

  function importCourse(courseName: string, files: TacticsCourseFile[]) {
    setAreas((previous) => {
      const orders = Object.values(previous.tactics.sets)
        .filter((set) => set.course?.name === courseName)
        .map((set) => set.course?.order ?? 0);
      const start = orders.length > 0 ? Math.max(...orders) + 1 : 0;
      const tactics = files.reduce(
        (state, file, index) =>
          addTacticsFileSet(state, {
            name: file.title,
            description: "",
            path: file.path,
            filename: file.filename,
            recordCount: file.recordCount,
            config: draftConfig,
            course: { name: courseName, order: start + index },
          }),
        previous.tactics,
      );
      return { ...previous, tactics };
    });
    setCourseScan(null);
    setDraftConfig(defaultConfig);
    setOpenCourse(courseName);
    setFeedback({
      text: trainingT(
        "Tactics.Course.Imported",
        "Folder “{{name}}” imported with {{themes}} sets.",
        { name: courseName, themes: files.length },
      ),
    });
  }

  function applyCourseAction() {
    if (!courseAction) return;
    const { kind, name } = courseAction;
    if (kind === "rename") {
      const next = courseRename.trim();
      if (!next) return;
      setAreas((previous) => ({
        ...previous,
        tactics: renameTacticsCourse(previous.tactics, name, next),
      }));
      if (openCourse === name) setOpenCourse(next);
    } else {
      setAreas((previous) => ({
        ...previous,
        tactics:
          kind === "delete"
            ? deleteTacticsCourse(previous.tactics, name)
            : ungroupTacticsCourse(previous.tactics, name),
      }));
      if (openCourse === name) setOpenCourse(null);
      setFeedback({
        text:
          kind === "delete"
            ? trainingT(
                "Tactics.Course.Deleted",
                "Folder “{{name}}” removed. Its PGN files were not deleted.",
                { name },
              )
            : trainingT(
                "Tactics.Course.Ungrouped",
                "Folder “{{name}}” removed: its sets are now in Available sets.",
                { name },
              ),
      });
    }
    setCourseAction(null);
  }

  function addSetsToCourse(courseName: string, setIds: string[]) {
    setAreas((previous) => ({
      ...previous,
      tactics: addSetsToTacticsCourse(previous.tactics, setIds, courseName),
    }));
    setPickerMode(null);
    setOpenCourse(courseName);
  }

  function moveSetToCourse(setId: string, courseName: string) {
    setAreas((previous) => ({
      ...previous,
      tactics: setTacticsSetCourse(previous.tactics, setId, courseName),
    }));
  }

  function moveSetInCourse(setId: string, direction: -1 | 1) {
    setAreas((previous) => ({
      ...previous,
      tactics: moveTacticsSetInCourse(previous.tactics, setId, direction),
    }));
  }

  function practiceSet(setId: string) {
    void navigate({
      to: "/training/tactics/practice/$setId",
      params: { setId },
      search: { problem: undefined },
    });
  }

  function review(setId: string) {
    setReviewIndex(0);
    setReviewView("list");
    setReviewSetId(setId);
  }

  function practiceReviewedProblem(index: number) {
    if (!reviewSetId) return;
    const setId = reviewSetId;
    setReviewSetId(null);
    void navigate({
      to: "/training/tactics/practice/$setId",
      params: { setId },
      search: { problem: index + 1 },
    });
  }

  const sampleSolutions = inspection?.samples.filter((sample) => sample.hasSolution).length ?? 0;
  const sampleVariations = inspection?.samples.filter((sample) => sample.hasVariations).length ?? 0;
  const sampleErrors = inspection?.samples.filter((sample) => sample.error).length ?? 0;
  const reviewAttempts = reviewExercise
    ? areas.tactics.attempts.filter(
        (attempt) => attempt.setId === reviewSetId && attempt.exerciseId === reviewExercise.id,
      )
    : [];

  const renderSetCard = (set: TacticsSet, place?: number, list?: TacticsSet[]) => {
    const inCourseView = Boolean(activeCourse && set.course);
    const progress = getTacticsSetProgress(areas.tactics, set.id);
    const resume = Math.min(
      set.config.mode === "woodpecker"
        ? set.progress.activeCycle
          ? getTacticsFirstIncompleteIndex(areas.tactics, set.id, set.progress.activeCycle.number)
          : 0
        : set.progress.nextExerciseIndex,
      Math.max(0, progress.total - 1),
    );
    const lastCycle = set.progress.cycles.at(-1);
    const recent = recentSetStats(areas.tactics, set.id);
    return (
      <Card key={set.id} withBorder>
        <Stack h="100%" justify="space-between">
          <div>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              {/* A long name wraps; the badge and the menu always keep their full width. */}
              <Title order={4} style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                {inCourseView && place !== undefined ? `${place + 1}. ${set.name}` : set.name}
              </Title>
              <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                <Badge color="orange">
                  {progress.completed}/{progress.total}
                </Badge>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={trainingT(
                        "Tactics.Course.SetOptions",
                        "Folder options for this set",
                      )}
                    >
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {inCourseView && place !== undefined && list && (
                      <>
                        <Menu.Item
                          leftSection={<IconArrowUp size={14} />}
                          disabled={place === 0}
                          onClick={() => moveSetInCourse(set.id, -1)}
                        >
                          {trainingT("Tactics.Course.MoveUp", "Move up")}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconArrowDown size={14} />}
                          disabled={place === list.length - 1}
                          onClick={() => moveSetInCourse(set.id, 1)}
                        >
                          {trainingT("Tactics.Course.MoveDown", "Move down")}
                        </Menu.Item>
                        <Menu.Divider />
                      </>
                    )}
                    <Menu.Item
                      leftSection={<IconFolderPlus size={14} />}
                      onClick={() => {
                        setMoveTarget("");
                        setMovingSetId(set.id);
                      }}
                    >
                      {set.course
                        ? trainingT("Tactics.Course.MoveTo", "Move to another folder…")
                        : trainingT("Tactics.Course.AddTo", "Add to a folder…")}
                    </Menu.Item>
                    {set.course && (
                      <Menu.Item
                        leftSection={<IconUnlink size={14} />}
                        onClick={() => moveSetToCourse(set.id, "")}
                      >
                        {trainingT("Tactics.Course.RemoveFrom", "Remove from the folder")}
                      </Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>
            <Text size="sm" c="dimmed" mt="xs" mih={42}>
              {set.description ||
                trainingT(
                  "Training.Copy.Tacticalpositioncollection.cc3246c4",
                  "Tactical position collection.",
                )}
            </Text>
            <Progress value={progress.percent} color="orange" mt="md" />
            <Group justify="space-between" mt={4}>
              <Text size="xs" c="dimmed">
                {" "}
                {trainingT("Training.Copy.Progress.1d4a9eeb", "Progress")} {progress.percent}%
              </Text>
              <Text size="xs" c="dimmed">
                {" "}
                {trainingT("Training.Copy.Next.57d01069", "Next:")} {resume + 1}
              </Text>
            </Group>
            <Group gap="xs" mt="sm">
              <Badge size="sm" variant="outline">
                {set.config.mode === "woodpecker"
                  ? "Woodpecker"
                  : trainingT("Training.Copy.Guided.57bd258f", "Guided")}
              </Badge>
              <Badge size="sm" color="blue" variant="light">
                {ratingLabel(set, trainingT)}
              </Badge>
              {set.origin === "bundled" && (
                <Badge size="sm" color="teal">
                  {" "}
                  {trainingT("Training.Copy.Included.384f88d5", "Included")}{" "}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" mt="sm">
              {progress.incorrect} {trainingT("Training.Copy.mistakes.5c65c76e", "mistakes ·")}{" "}
              {set.progress.cycles.length} {trainingT("Training.Copy.cycles.5d205153", "cycles")}{" "}
              {lastCycle
                ? trainingT("Training.Copy.lastv0mistakes.35e6e46a", " · last: {{v0}} mistakes", {
                    v0: lastCycle.failures,
                  })
                : ""}
            </Text>
            {recent.accuracy !== null && (
              <Text size="xs" c="dimmed">
                {trainingT(
                  "Tactics.Shelf.Recent",
                  "Recent accuracy {{accuracy}} % · {{time}} on average",
                  {
                    accuracy: Math.round(recent.accuracy * 100),
                    time:
                      recent.averageMs !== null ? `${Math.round(recent.averageMs / 1000)} s` : "–",
                  },
                )}
              </Text>
            )}
          </div>
          <Stack gap="xs" mt="md">
            <Button
              color="orange"
              leftSection={<IconPlayerPlay size={16} />}
              onClick={() => practiceSet(set.id)}
            >
              {set.config.mode === "woodpecker" && !set.progress.activeCycle
                ? set.progress.cycles.length > 0
                  ? trainingT("Training.Copy.Startcyclev0.4952ee6f", "Start cycle {{v0}}", {
                      v0: set.progress.cycles.length + 1,
                    })
                  : trainingT("Training.Copy.Startcycle1.1f37b857", "Start cycle 1")
                : progress.attempted > 0
                  ? trainingT(
                      "Training.Copy.Continueatpuzzlev0.e476dc9b",
                      "Continue at puzzle {{v0}}",
                      { v0: resume + 1 },
                    )
                  : trainingT("Training.Copy.Startset.88c407a1", "Start set")}
            </Button>
            <Button
              variant="light"
              leftSection={<IconChartBar size={16} />}
              onClick={() => setStatisticsSetId(set.id)}
            >
              {trainingT("Training.Tactics.Stats.Button", "Statistics")}
            </Button>
            <Group grow>
              <Button
                variant="default"
                leftSection={<IconEye size={16} />}
                onClick={() => review(set.id)}
              >
                {" "}
                {trainingT("Training.Copy.Review.52fadddb", "Review")}{" "}
              </Button>
              <Button
                variant="default"
                leftSection={<IconSettings size={16} />}
                onClick={() => editSet(set)}
              >
                {" "}
                {trainingT("Training.Copy.Configure.d685ddb9", "Configure")}{" "}
              </Button>
              {set.origin === "user" && (
                <ActionIcon
                  size={36}
                  color="red"
                  variant="subtle"
                  aria-label={trainingT("Training.Copy.Deletev0.8fd0a297", "Delete {{v0}}", {
                    v0: set.name,
                  })}
                  onClick={() => setDeletingSetId(set.id)}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
          </Stack>
        </Stack>
      </Card>
    );
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Group align="flex-start">
          <Button
            component={Link}
            to="/training"
            variant="subtle"
            p="xs"
            aria-label={trainingT("Training.Copy.Back.ab26ae7b", "Back")}
          >
            <IconArrowLeft size={20} />
          </Button>
          <div>
            <Title order={2}>
              {trainingT("Training.Copy.Tacticstraining.8816b222", "Tactics training")}
            </Title>
            <Text c="dimmed">
              {trainingT(
                "Training.Copy.Chooseasetresumeyour.f0e70311",
                "Choose a set, resume your progress, and train at your own pace.",
              )}
            </Text>
          </div>
        </Group>

        {feedback && (
          <Alert color={feedback.color} withCloseButton onClose={() => setFeedback(null)}>
            {feedback.text}
          </Alert>
        )}

        <TacticsProgressCards
          state={tacticsReview}
          onReview={() => tacticsReview && setReviewSessionItems(dueTacticsReview(tacticsReview))}
          onAutoAddChange={(autoAdd) => updateTacticsReview((state) => ({ ...state, autoAdd }))}
        />

        {activeCourse ? (
          <>
            <Group justify="space-between" align="flex-start">
              <Group align="flex-start" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  aria-label={trainingT("Tactics.Course.Back", "All folders and sets")}
                  onClick={() => setOpenCourse(null)}
                >
                  <IconArrowLeft size={20} />
                </ActionIcon>
                <div>
                  <Title order={3}>{activeCourse.name}</Title>
                  <Text size="sm" c="dimmed">
                    {trainingT(
                      "Tactics.Course.Progress",
                      "{{themes}} sets · {{completed}} of {{total}} puzzles completed",
                      {
                        themes: activeCourse.sets.length,
                        completed: activeCourseProgress?.completed.toLocaleString(),
                        total: activeCourseProgress?.total.toLocaleString(),
                      },
                    )}
                  </Text>
                </div>
              </Group>
              <Group gap="xs">
                <Button
                  variant="default"
                  leftSection={<IconFolderPlus size={16} />}
                  onClick={() => setPickerMode({ kind: "add", courseName: activeCourse.name })}
                >
                  {trainingT("Tactics.Course.AddSets", "Add sets")}
                </Button>
                <CourseMenu
                  onAction={(kind) => {
                    setCourseRename(activeCourse.name);
                    setCourseAction({ kind, name: activeCourse.name });
                  }}
                />
              </Group>
            </Group>
            <Progress value={activeCourseProgress?.percent ?? 0} color="orange" />
            <Group>
              <Button
                color="orange"
                leftSection={<IconPlayerPlay size={16} />}
                disabled={!nextCourseSet}
                onClick={() => nextCourseSet && practiceSet(nextCourseSet.id)}
              >
                {nextCourseSet
                  ? trainingT("Tactics.Course.Continue", "Continue: {{theme}}", {
                      theme: nextCourseSet.name,
                    })
                  : trainingT("Tactics.Course.Done", "All sets completed")}
              </Button>
              <Button
                variant="light"
                color="orange"
                leftSection={<IconFolder size={16} />}
                onClick={() => setMixCourseName(activeCourse.name)}
              >
                {trainingT("Tactics.Course.TrainAll", "Train the whole folder")}
              </Button>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
              {activeCourse.sets.map(renderSetCard)}
            </SimpleGrid>
          </>
        ) : (
          <>
            <>
              <Group justify="space-between" align="flex-end">
                <div>
                  <Title order={3}>{trainingT("Tactics.Course.Title", "Folders")}</Title>
                  <Text size="sm" c="dimmed">
                    {trainingT(
                      "Tactics.Course.Subtitle",
                      "Group your sets the way you study: a book split by themes, a course, or your own selection of puzzles.",
                    )}
                  </Text>
                </div>
                <Button
                  variant="default"
                  leftSection={<IconFolderPlus size={16} />}
                  onClick={() => setPickerMode({ kind: "new" })}
                >
                  {trainingT("Tactics.Course.New", "New folder")}
                </Button>
              </Group>
              {courses.length === 0 ? (
                // What folders are for, until there is one.
                <Card withBorder style={{ borderStyle: "dashed" }}>
                  <Group align="flex-start" wrap="nowrap">
                    <IconFolder
                      size={34}
                      color="var(--mantine-color-orange-6)"
                      style={{ flexShrink: 0 }}
                    />
                    <Stack gap="xs">
                      <Text fw={600}>
                        {trainingT("Tactics.Course.EmptyTitle", "Organize your sets in folders")}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {trainingT(
                          "Tactics.Course.EmptyText",
                          "Put related sets together and train them as one: a book split into one PGN per theme, a course, or your own collection, such as several Lichess sets built by theme and level. Each set keeps its own progress, and you can train the whole folder at once.",
                        )}
                      </Text>
                      <Group gap="xs" mt={4}>
                        <Button
                          size="xs"
                          variant="light"
                          color="orange"
                          leftSection={<IconFolderPlus size={14} />}
                          disabled={sets.length === 0}
                          onClick={() => setPickerMode({ kind: "new" })}
                        >
                          {trainingT("Tactics.Course.New", "New folder")}
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          loading={courseBusy}
                          leftSection={<IconFolderOpen size={14} />}
                          onClick={selectCourseFolder}
                        >
                          {trainingT("Tactics.Course.ImportTitle", "Import a folder of PGNs")}
                        </Button>
                      </Group>
                    </Stack>
                  </Group>
                </Card>
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
                  {courses.map((course) => {
                    const progress = getTacticsCourseProgress(areas.tactics, course);
                    return (
                      <Card key={course.name} withBorder>
                        <Stack h="100%" justify="space-between">
                          <div>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                              <IconFolder size={26} color="var(--mantine-color-orange-6)" />
                              <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                                <Badge color="orange">
                                  {progress.completed}/{progress.total}
                                </Badge>
                                <CourseMenu
                                  onAction={(kind) => {
                                    setCourseRename(course.name);
                                    setCourseAction({ kind, name: course.name });
                                  }}
                                />
                              </Group>
                            </Group>
                            <Title order={4} mt="sm" style={{ overflowWrap: "anywhere" }}>
                              {course.name}
                            </Title>
                            <Text size="sm" c="dimmed" mt={4} lineClamp={2}>
                              {course.sets.map((set) => set.name).join(" · ")}
                            </Text>
                            <Progress value={progress.percent} color="orange" mt="md" />
                            <Text size="xs" c="dimmed" mt={4}>
                              {trainingT(
                                "Tactics.Course.CardProgress",
                                "{{themes}} sets · {{percent}}% completed",
                                { themes: course.sets.length, percent: progress.percent },
                              )}
                            </Text>
                          </div>
                          <Button
                            color="orange"
                            mt="md"
                            leftSection={<IconFolderOpen size={16} />}
                            onClick={() => setOpenCourse(course.name)}
                          >
                            {trainingT("Tactics.Course.Open", "Open folder")}
                          </Button>
                        </Stack>
                      </Card>
                    );
                  })}
                </SimpleGrid>
              )}
            </>

            <Group justify="space-between" align="flex-end">
              <div>
                <Title order={3}>
                  {trainingT("Training.Copy.Availablesets.d6d3e738", "Available sets")}
                </Title>
                <Text size="sm" c="dimmed">
                  {" "}
                  {trainingT(
                    "Training.Copy.Eachsetkeepsitsprogress.6ec42902",
                    "Each set keeps its progress, recommended level, and previous cycles.",
                  )}{" "}
                </Text>
              </div>
            </Group>

            {looseSets.length === 0 ? (
              courses.length === 0 && (
                <Card withBorder>
                  <Stack align="center" py="xl">
                    <IconPuzzle size={42} color="var(--mantine-color-dimmed)" />
                    <Text c="dimmed">
                      {trainingT(
                        "Training.Copy.Nosetsavailableyet.3041bd51",
                        "No sets available yet.",
                      )}
                    </Text>
                  </Stack>
                </Card>
              )
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
                {looseSets.map(renderSetCard)}
              </SimpleGrid>
            )}
          </>
        )}

        <Card withBorder>
          <Stack>
            <Group justify="space-between">
              <Group>
                <IconDatabase size={26} color="var(--mantine-color-orange-6)" />
                <div>
                  <Text fw={600}>
                    {trainingT(
                      "Training.Copy.Installedpuzzledatabases.0a978ef7",
                      "Installed puzzle databases",
                    )}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {" "}
                    {trainingT(
                      "Training.Copy.Trainwithyourlocaldatabases.45bd0460",
                      "Train with your local databases and filters.",
                    )}{" "}
                  </Text>
                </div>
              </Group>
              <Badge color="orange">{puzzleDbs.length}</Badge>
            </Group>
            {puzzleDbs.length > 0 ? (
              <>
                <Text size="xs" c="dimmed">
                  {puzzleDbs.map((db) => db.title.replace(/\.db3$/i, "")).join(" · ")}
                </Text>
                <Group grow>
                  <Button
                    variant="light"
                    leftSection={<IconPlayerPlay size={16} />}
                    onClick={openLichessTrainer}
                  >
                    {trainingT(
                      "Training.Copy.Opendatabasetrainer.54b0961e",
                      "Open database trainer",
                    )}
                  </Button>
                  <Button
                    variant="default"
                    leftSection={<IconWand size={16} />}
                    onClick={() => setBuilderOpen(true)}
                  >
                    {trainingT("Tactics.Builder.Open", "Build a set")}
                  </Button>
                </Group>
                <Button
                  variant="subtle"
                  size="xs"
                  color="gray"
                  onClick={() => setAddPuzzleDbOpen(true)}
                >
                  {trainingT("Tactics.PuzzleDb.More", "Download more puzzle databases")}
                </Button>
              </>
            ) : (
              <>
                <Text size="sm">
                  {trainingT(
                    "Tactics.PuzzleDb.Empty",
                    "Your own PGN sets work without it, but a puzzle database makes training easier: Lichess's has millions of puzzles with rating and themes, to train with them and to build sets from your filters.",
                  )}
                </Text>
                <Button
                  variant="light"
                  leftSection={<IconDownload size={16} />}
                  onClick={() => setAddPuzzleDbOpen(true)}
                >
                  {trainingT("Tactics.PuzzleDb.Download", "Download a puzzle database")}
                </Button>
              </>
            )}
          </Stack>
        </Card>

        <Card ref={importCardRef} withBorder>
          <Stack>
            <Group>
              <IconUpload size={26} color="var(--mantine-color-orange-6)" />
              <div>
                <Text fw={600}>
                  {trainingT(
                    "Training.Copy.ImportanotherPGNset.1d885849",
                    "Import another PGN set",
                  )}
                </Text>
                <Text size="sm" c="dimmed">
                  {" "}
                  {trainingT(
                    "Training.Copy.Reviewasamplebeforeadding.624433b2",
                    "Review a sample before adding it; the file is read on demand.",
                  )}{" "}
                </Text>
              </div>
            </Group>
            <PendingPgnNotice path={pendingImport.path} onClear={pendingImport.clear} />
            <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }}>
              <TextInput
                label={trainingT("Training.Copy.Name.562bb157", "Name")}
                value={setName}
                onChange={(event) => setSetName(event.currentTarget.value)}
              />
              <TextInput
                label={trainingT("Training.Copy.Description.ee00b96f", "Description")}
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
              <NumberInput
                label={trainingT("Training.Copy.MinimumELO.8f4b3e52", "Minimum ELO")}
                placeholder={trainingT("Training.Copy.Optional.a6e63474", "Optional")}
                min={0}
                value={ratingMin}
                onChange={setRatingMin}
              />
              <NumberInput
                label={trainingT("Training.Copy.MaximumELO.86ea8125", "Maximum ELO")}
                placeholder={trainingT("Training.Copy.Optional.a6e63474", "Optional")}
                min={0}
                value={ratingMax}
                onChange={setRatingMax}
              />
            </SimpleGrid>
            <Button
              color="orange"
              loading={importBusy}
              leftSection={<IconUpload size={16} />}
              onClick={selectImportFile}
            >
              {" "}
              {trainingT("Training.Copy.SelectPGN.c64242a6", "Select PGN")}{" "}
            </Button>
          </Stack>
        </Card>

        <Card withBorder>
          <Stack>
            <Group>
              <IconFolder size={26} color="var(--mantine-color-orange-6)" />
              <div>
                <Text fw={600}>
                  {trainingT("Tactics.Course.ImportTitle", "Import a folder of PGNs")}
                </Text>
                <Text size="sm" c="dimmed">
                  {trainingT(
                    "Tactics.Course.ImportHint",
                    "For a book or course split into one PGN per theme: each PGN becomes a set inside the folder, with its own progress.",
                  )}
                </Text>
              </div>
            </Group>
            <Button
              variant="light"
              color="orange"
              loading={courseBusy}
              leftSection={<IconFolderOpen size={16} />}
              onClick={selectCourseFolder}
            >
              {trainingT("Tactics.Course.SelectFolder", "Select folder")}
            </Button>
          </Stack>
        </Card>
      </Stack>

      <Modal
        opened={inspection !== null}
        onClose={() => setInspection(null)}
        title={trainingT("Training.Copy.Reviewimport.fdac9a14", "Review import")}
        size="lg"
      >
        {inspection && (
          <Stack>
            <Alert color={sampleErrors > 0 ? "yellow" : "blue"}>
              {inspection.recordCount.toLocaleString()}{" "}
              {trainingT("Training.Copy.puzzlesInthesample.8d658c6e", "puzzles. In the sample:")}{" "}
              {sampleSolutions}{" "}
              {trainingT("Training.Copy.withsolutions.9969c715", "with solutions,")}{" "}
              {sampleVariations}{" "}
              {trainingT("Training.Copy.withvariationsand.e3e62542", "with variations and")}{" "}
              {sampleErrors} {trainingT("Training.Copy.invalid.1ca85cf6", "invalid.")}{" "}
            </Alert>
            <ScrollArea h={210}>
              <Stack gap="xs" pr="sm">
                {inspection.samples.map((sample) => (
                  <Card key={sample.index} withBorder padding="xs">
                    <Text size="sm" fw={500}>
                      {sample.index + 1}. {sample.title}
                    </Text>
                    <Text size="xs" c={sample.error ? "red" : "dimmed"}>
                      {sample.error ||
                        (sample.hasSolution
                          ? trainingT("Training.Copy.v0plies.b7fec1eb", "{{v0}} plies", {
                              v0: sample.moveCount,
                            })
                          : trainingT(
                              "Training.Copy.Nopreparedsolution.2ac57fbb",
                              "No prepared solution",
                            ))}
                    </Text>
                  </Card>
                ))}
              </Stack>
            </ScrollArea>
            <TacticsConfigFields config={draftConfig} onChange={setDraftConfig} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setInspection(null)}>
                {" "}
                {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}{" "}
              </Button>
              <Button color="orange" onClick={confirmImport}>
                {" "}
                {trainingT("Training.Copy.Importset.ea3b85ed", "Import set")}{" "}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <CourseMixSession course={mixCourse} onClose={() => setMixCourseName(null)} />

      <CourseSetsPicker
        mode={pickerMode}
        sets={sets}
        existingCourses={courseNames}
        onClose={() => setPickerMode(null)}
        onConfirm={addSetsToCourse}
      />

      <Modal
        opened={movingSet !== undefined}
        onClose={() => setMovingSetId(null)}
        title={
          movingSet?.course
            ? trainingT("Tactics.Course.MoveTo", "Move to another folder…")
            : trainingT("Tactics.Course.AddTo", "Add to a folder…")
        }
      >
        {movingSet && (
          <Stack>
            <Text size="sm">{movingSet.name}</Text>
            <Autocomplete
              label={trainingT("Tactics.Course.Field", "Folder")}
              description={trainingT(
                "Tactics.Course.MoveHint",
                "Choose a folder or type a new name to create one.",
              )}
              data={courseNames.filter((name) => name !== movingSet.course?.name)}
              value={moveTarget}
              onChange={setMoveTarget}
              data-autofocus
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setMovingSetId(null)}>
                {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}
              </Button>
              <Button
                color="orange"
                disabled={!moveTarget.trim() || moveTarget.trim() === movingSet.course?.name}
                onClick={() => {
                  moveSetToCourse(movingSet.id, moveTarget);
                  setMovingSetId(null);
                }}
              >
                {trainingT("Tactics.Course.MoveConfirm", "Move")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <TacticsCourseImport
        scan={courseScan}
        existingCourses={courseNames}
        configFields={<TacticsConfigFields config={draftConfig} onChange={setDraftConfig} />}
        onClose={() => setCourseScan(null)}
        onImport={importCourse}
      />

      <Modal
        opened={courseAction !== null}
        onClose={() => setCourseAction(null)}
        title={
          courseAction?.kind === "rename"
            ? trainingT("Tactics.Course.Rename", "Rename folder")
            : courseAction?.kind === "delete"
              ? trainingT("Tactics.Course.Delete", "Delete folder and its sets")
              : trainingT("Tactics.Course.Ungroup", "Remove folder, keep sets")
        }
      >
        {courseAction && (
          <Stack>
            {courseAction.kind === "rename" ? (
              <TextInput
                label={trainingT("Tactics.Course.Name", "Folder name")}
                value={courseRename}
                onChange={(event) => setCourseRename(event.currentTarget.value)}
                data-autofocus
              />
            ) : (
              <Text size="sm">
                {courseAction.kind === "delete"
                  ? trainingT(
                      "Tactics.Course.DeleteConfirm",
                      "Remove “{{name}}” and all its sets, with their progress? Its PGN files stay on disk.",
                      { name: courseAction.name },
                    )
                  : trainingT(
                      "Tactics.Course.UngroupConfirm",
                      "Remove the folder “{{name}}”? Its sets keep their progress and move to Available sets.",
                      { name: courseAction.name },
                    )}
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setCourseAction(null)}>
                {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}
              </Button>
              <Button
                color={courseAction.kind === "delete" ? "red" : "orange"}
                disabled={courseAction.kind === "rename" && !courseRename.trim()}
                onClick={applyCourseAction}
              >
                {courseAction.kind === "rename"
                  ? trainingT("Training.Copy.Save.13e51a21", "Save")
                  : courseAction.kind === "delete"
                    ? trainingT("Tactics.Course.Delete", "Delete folder and its sets")
                    : trainingT("Tactics.Course.Ungroup", "Remove folder, keep sets")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {reviewSessionItems && (
        <TacticsReviewSession
          items={reviewSessionItems}
          onResult={(item, result) =>
            updateTacticsReview((state) => recordTacticsReview(state, item.id, result))
          }
          onClose={() => setReviewSessionItems(null)}
        />
      )}

      <AddPuzzle
        puzzleDbs={puzzleDbs}
        opened={addPuzzleDbOpen}
        setOpened={setAddPuzzleDbOpen}
        setPuzzleDbs={setPuzzleDbs}
      />
      <PuzzleSetBuilder
        opened={builderOpen}
        databases={puzzleDbs}
        myLevel={myLevel}
        onClose={() => setBuilderOpen(false)}
        onCreate={(request) => {
          setAreas((previous) => ({
            ...previous,
            tactics: addPuzzleSet(previous.tactics, request).state,
          }));
          setBuilderOpen(false);
          setFeedback({
            text: trainingT(
              "Training.Copy.Setv0addedwithv1.f3488bc5",
              "Set “{{v0}}” added with {{v1}} puzzles.",
              { v0: request.name, v1: request.puzzles.length },
            ),
          });
        }}
      />

      {statisticsSet && (
        <TacticsSetStatisticsModal
          opened
          onClose={() => setStatisticsSetId(null)}
          set={statisticsSet}
          state={areas.tactics}
        />
      )}

      <Modal
        opened={editingSetId !== null}
        onClose={() => setEditingSetId(null)}
        title={trainingT("Training.Copy.Configureset.2cabbadb", "Configure set")}
        size="lg"
      >
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label={trainingT("Training.Copy.Name.562bb157", "Name")}
              value={draftName}
              onChange={(event) => setDraftName(event.currentTarget.value)}
            />
            <TextInput
              label={trainingT("Training.Copy.Description.ee00b96f", "Description")}
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.currentTarget.value)}
            />
            <Autocomplete
              label={trainingT("Tactics.Course.Field", "Folder")}
              placeholder={trainingT("Tactics.Course.FieldPlaceholder", "None (loose set)")}
              description={trainingT(
                "Tactics.Course.FieldHint",
                "Type a new name to create a folder, or leave it empty.",
              )}
              data={courseNames}
              value={draftCourse}
              onChange={setDraftCourse}
            />
            <div />
            <NumberInput
              label={trainingT("Training.Copy.MinimumELO.8f4b3e52", "Minimum ELO")}
              placeholder={trainingT("Training.Copy.Optional.a6e63474", "Optional")}
              min={0}
              value={draftRatingMin}
              onChange={setDraftRatingMin}
            />
            <NumberInput
              label={trainingT("Training.Copy.MaximumELO.86ea8125", "Maximum ELO")}
              placeholder={trainingT("Training.Copy.Optional.a6e63474", "Optional")}
              min={0}
              value={draftRatingMax}
              onChange={setDraftRatingMax}
            />
          </SimpleGrid>
          <TacticsConfigFields config={draftConfig} onChange={setDraftConfig} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditingSetId(null)}>
              {" "}
              {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}{" "}
            </Button>
            <Button color="orange" disabled={!draftName.trim()} onClick={saveSettings}>
              {" "}
              {trainingT("Training.Copy.Save.13e51a21", "Save")}{" "}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={reviewSetId !== null}
        onClose={() => setReviewSetId(null)}
        title={
          reviewSet
            ? trainingT("Training.Copy.Reviewv0.1225646c", "Review · {{v0}}", {
                v0: reviewSet.name,
              })
            : trainingT("Training.Copy.Reviewset.80a50582", "Review set")
        }
        size="xl"
      >
        {reviewSet && (
          <Stack>
            <SegmentedControl
              fullWidth
              value={reviewView}
              onChange={(value) => setReviewView(value as "list" | "detail")}
              data={[
                { value: "list", label: trainingT("Training.Copy.PGNlist.ae6d1c72", "PGN list") },
                {
                  value: "detail",
                  label: trainingT("Training.Copy.Detailsandboard.97f9fbdf", "Details and board"),
                },
              ]}
            />
            {reviewView === "list" ? (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {reviewSet.config.mode === "woodpecker"
                      ? trainingT(
                          "Training.Copy.Completedincyclev0v1.5c3dbffb",
                          "Completed in cycle {{v0}}: {{v1}}",
                          { v0: reviewCycleNumber, v1: reviewCompletedIndexes.length },
                        )
                      : trainingT("Training.Copy.Completedv0.03311aa2", "Completed: {{v0}}", {
                          v0: reviewCompletedIndexes.length,
                        })}
                  </Text>
                  <Badge>
                    {reviewTotal} {trainingT("Training.Copy.puzzles.29f0f1a4", "puzzles")}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {" "}
                  {trainingT(
                    "Training.Copy.Selectanyrecordtoopen.e9e71457",
                    "Select any record to open it on the board. Exploring other puzzles does not change your resume point.",
                  )}{" "}
                </Text>
                <ScrollArea h={520} viewportRef={reviewListViewportRef} type="auto">
                  <div
                    style={{
                      height: reviewListVirtualizer.getTotalSize(),
                      position: "relative",
                    }}
                  >
                    {reviewListVirtualizer.getVirtualItems().map((virtualRow) => {
                      const problemIndex = virtualRow.index;
                      const exerciseId = reviewSet.exerciseIds[problemIndex];
                      const embeddedExercise = exerciseId
                        ? areas.tactics.exercises[exerciseId]
                        : undefined;
                      const completed = reviewCompletedSet.has(problemIndex);
                      return (
                        <Button
                          key={problemIndex}
                          variant={completed ? "light" : "default"}
                          color={completed ? "teal" : "gray"}
                          fullWidth
                          justify="space-between"
                          leftSection={
                            completed ? <IconCheck size={16} /> : <Text>{problemIndex + 1}</Text>
                          }
                          rightSection={<IconPlayerPlay size={15} />}
                          onClick={() => practiceReviewedProblem(problemIndex)}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            height: 40,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <Text size="sm" truncate>
                            {embeddedExercise?.title ||
                              trainingT("Training.Copy.Puzzlev0.c9ca2375", "Puzzle {{v0}}", {
                                v0: problemIndex + 1,
                              })}
                            {completed
                              ? ` · ${trainingT("Training.CompletedLower", "completed")}`
                              : ""}
                          </Text>
                        </Button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </Stack>
            ) : (
              <Stack>
                <Group justify="space-between">
                  <Group align="flex-end">
                    <ActionIcon
                      size={36}
                      variant="default"
                      disabled={reviewIndex === 0}
                      onClick={() => setReviewIndex((value) => value - 1)}
                    >
                      <IconChevronLeft size={16} />
                    </ActionIcon>
                    <NumberInput
                      label={trainingT("Training.Copy.Puzzle.cc6c1a06", "Puzzle")}
                      w={150}
                      min={1}
                      max={reviewTotal}
                      value={reviewIndex + 1}
                      onChange={(value) =>
                        setReviewIndex(
                          Math.min(reviewTotal - 1, Math.max(0, Number(value || 1) - 1)),
                        )
                      }
                    />
                    <ActionIcon
                      size={36}
                      variant="default"
                      disabled={reviewIndex + 1 >= reviewTotal}
                      onClick={() => setReviewIndex((value) => value + 1)}
                    >
                      <IconChevronRight size={16} />
                    </ActionIcon>
                  </Group>
                  <Badge>
                    {reviewIndex + 1} {trainingT("Training.Copy.of.959a45d4", "of")} {reviewTotal}
                  </Badge>
                </Group>
                {reviewLoading ? (
                  <Text c="dimmed">
                    {trainingT("Training.Copy.Loadingpuzzle.f51a73af", "Loading puzzle…")}
                  </Text>
                ) : reviewError ? (
                  <Alert color="red">{reviewError}</Alert>
                ) : reviewExercise ? (
                  <SimpleGrid cols={{ base: 1, md: 2 }}>
                    <Stack>
                      <TacticsReviewBoard key={reviewExercise.id} fen={reviewExercise.fen} />
                      <Text fw={600}>{reviewExercise.title}</Text>
                      <Code block>{reviewExercise.fen}</Code>
                      <div>
                        <Text size="sm" fw={600}>
                          {" "}
                          {trainingT(
                            "Training.Copy.Parsedsolutions.e4a6ad63",
                            "Parsed solutions",
                          )}{" "}
                        </Text>
                        {reviewExercise.solutionLines.length > 0 ? (
                          reviewExercise.solutionLines.map((line, index) => (
                            <Code key={`${reviewExercise.id}-${index}`} block mt={4}>
                              {line.join(" ")}
                            </Code>
                          ))
                        ) : (
                          <Text size="sm" c="dimmed">
                            {" "}
                            {trainingT(
                              "Training.Copy.Nopreparedsolutionanengine.1544feda",
                              "No prepared solution; an engine is required.",
                            )}{" "}
                          </Text>
                        )}
                      </div>
                      <Text size="sm">
                        {reviewAttempts.filter((a) => a.outcome === "correct").length}{" "}
                        {trainingT("Training.Copy.correct.a2ea3fbc", "correct ·")}{" "}
                        {reviewAttempts.filter((a) => a.outcome === "incorrect").length}{" "}
                        {trainingT("Training.Copy.mistakes.5fb1604c", "mistakes")}{" "}
                      </Text>
                      <Button
                        leftSection={<IconPlayerPlay size={16} />}
                        onClick={() => practiceReviewedProblem(reviewIndex)}
                      >
                        {" "}
                        {trainingT(
                          "Training.Copy.Practicethispuzzle.9d0effd1",
                          "Practice this puzzle",
                        )}{" "}
                      </Button>
                    </Stack>
                    <Textarea
                      label={trainingT("Training.Copy.PGNrecord.f7296c15", "PGN record")}
                      readOnly
                      autosize
                      minRows={15}
                      maxRows={24}
                      value={
                        reviewExercise.sourcePgn ||
                        trainingT(
                          "Training.Copy.NoPGNtexthasbeen.d994de65",
                          "No PGN text has been saved.",
                        )
                      }
                    />
                  </SimpleGrid>
                ) : null}
              </Stack>
            )}
          </Stack>
        )}
      </Modal>

      <Modal
        opened={deletingSetId !== null}
        onClose={() => setDeletingSetId(null)}
        title={trainingT("Training.Copy.Deleteset.0d8bbde1", "Delete set")}
        size="sm"
      >
        <Stack>
          <Text size="sm">
            {" "}
            {trainingT(
              "Training.Copy.Progresscyclesandattemptswill.331b07ea",
              "Progress, cycles, and attempts will be deleted. The original PGN remains untouched.",
            )}{" "}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              leftSection={<IconEye size={16} />}
              onClick={() => {
                if (!deletingSetId) return;
                const id = deletingSetId;
                setDeletingSetId(null);
                review(id);
              }}
            >
              {" "}
              {trainingT("Training.Copy.Reviewfirst.15a9aa85", "Review first")}{" "}
            </Button>
            <Button color="red" onClick={removeSet}>
              {" "}
              {trainingT("Training.Copy.Deleteset.0d8bbde1", "Delete set")}{" "}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

function CourseMenu({ onAction }: { onAction: (kind: "rename" | "ungroup" | "delete") => void }) {
  const { t: trainingT } = useTrainingTranslation();
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={trainingT("Tactics.Course.Options", "Folder options")}
        >
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => onAction("rename")}>
          {trainingT("Tactics.Course.Rename", "Rename folder")}
        </Menu.Item>
        <Menu.Item leftSection={<IconUnlink size={14} />} onClick={() => onAction("ungroup")}>
          {trainingT("Tactics.Course.Ungroup", "Remove folder, keep sets")}
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={14} />}
          onClick={() => onAction("delete")}
        >
          {trainingT("Tactics.Course.Delete", "Delete folder and its sets")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function TacticsReviewBoard({ fen }: { fen: string }) {
  const initial = useMemo(() => defaultTree(fen), [fen]);
  const boardRef = useRef<HTMLDivElement>(null);
  return (
    <div style={{ width: "100%", maxWidth: 430, alignSelf: "center" }}>
      <TreeStateProvider initial={initial}>
        <Board editingMode={false} movable="none" boardRef={boardRef} />
      </TreeStateProvider>
    </div>
  );
}

function TacticsConfigFields({
  config,
  onChange,
}: {
  config: TacticsSet["config"];
  onChange: (config: TacticsSet["config"]) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();

  return (
    <Stack>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label={trainingT("Training.Copy.Firstmove.5f131f9a", "First move")}
          value={config.startingActor}
          data={[
            {
              value: "student",
              label: trainingT("Training.Copy.Thestudent.5c566d78", "The student"),
            },
            {
              value: "opponent",
              label: trainingT("Training.Copy.Theopponent.16ea601a", "The opponent"),
            },
          ]}
          onChange={(value) =>
            value &&
            onChange({ ...config, startingActor: value as TacticsSet["config"]["startingActor"] })
          }
        />
        <Select
          label={trainingT("Training.Copy.Variations.64774cce", "Variations")}
          value={config.variationPolicy}
          data={[
            { value: "mainline", label: trainingT("Training.Copy.Mainline.49e68e3d", "Main line") },
            {
              value: "opponentResponses",
              label: trainingT("Training.Copy.Opponentresponses.999dc9d0", "Opponent responses"),
            },
            { value: "all", label: trainingT("Training.Copy.All.aff4d19d", "All") },
          ]}
          onChange={(value) =>
            value &&
            onChange({
              ...config,
              variationPolicy: value as TacticsSet["config"]["variationPolicy"],
            })
          }
        />
        <Select
          label={trainingT("Training.Copy.Validation.c1e3865f", "Validation")}
          value={config.validationMode}
          data={[
            { value: "auto", label: trainingT("Training.Copy.Automatic.e51e19df", "Automatic") },
            {
              value: "prepared",
              label: trainingT("Training.Copy.PGNsolution.c4ca9361", "PGN solution"),
            },
            { value: "engine", label: trainingT("Training.Copy.Engine.b25a14f2", "Engine") },
          ]}
          onChange={(value) =>
            value &&
            onChange({ ...config, validationMode: value as TacticsSet["config"]["validationMode"] })
          }
        />
        <Select
          label={trainingT("Training.Copy.Type.3868d284", "Type")}
          value={config.mode}
          data={[
            { value: "guided", label: trainingT("Training.Copy.Guided.57bd258f", "Guided") },
            { value: "woodpecker", label: "Woodpecker" },
          ]}
          onChange={(value) =>
            value && onChange({ ...config, mode: value as TacticsSet["config"]["mode"] })
          }
        />
      </SimpleGrid>
      <Group justify="space-between">
        <Text size="sm">
          {trainingT(
            "Training.Copy.Alternativemovetolerance.c8f821d8",
            "Alternative move tolerance",
          )}
        </Text>
        <NumberInput
          w={120}
          min={0}
          suffix=" cp"
          value={config.acceptanceThresholdCp}
          onChange={(value) =>
            onChange({ ...config, acceptanceThresholdCp: Math.max(0, Number(value) || 0) })
          }
        />
      </Group>
      <Switch
        label={trainingT("Training.Tactics.Timer.Exercise.Toggle", "Per-exercise timer")}
        description={trainingT(
          "Training.Tactics.Timer.Exercise.ToggleDesc",
          "Shows how long each puzzle takes. It can be turned off later during the session.",
        )}
        checked={config.exerciseTimer !== false}
        onChange={(event) => onChange({ ...config, exerciseTimer: event.currentTarget.checked })}
      />
      {config.mode === "woodpecker" && (
        <Text size="xs" c="dimmed">
          {" "}
          {trainingT(
            "Training.Copy.Cyclesrecordtimeandmistakes.24fef14e",
            "Cycles record time and mistakes but do not end at a limit.",
          )}{" "}
        </Text>
      )}
    </Stack>
  );
}
