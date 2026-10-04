import { Alert, Button, Checkbox, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom, useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { moveNotationTypeAtom } from "@/state/atoms";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { addPieceSymbol, formatNumberedMove } from "@/utils/annotation";
import {
  createPositionTacticsRecord,
  getPositionSolutionBranches,
  getPositionStartOptions,
  type PositionSolutionBranch,
} from "@/utils/positionActions";
import {
  addTacticsExerciseToSet,
  addTacticsSet,
  type TacticsStartingActor,
  type TacticsVariationPolicy,
} from "@/utils/trainingAreas";
import type { TreeState } from "@/utils/treeReducer";

const NEW_TARGET = "__new__";
const BRANCH_PREVIEW_PLIES = 8;

export default function PositionTacticsForm({
  tree,
  sourceLabel,
  onCreated,
}: {
  tree: TreeState;
  sourceLabel: string;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [areas, setAreas] = useAtom(trainingAreasAtom);
  const symbols = useAtomValue(moveNotationTypeAtom) === "symbols";
  const formatMove = (san: string, halfMoves: number) =>
    formatNumberedMove(symbols ? addPieceSymbol(san) : san, halfMoves);
  const startOptions = useMemo(() => getPositionStartOptions(tree), [tree]);
  // The tactic starts at the displayed position unless an earlier one of the game is chosen.
  const [startDepth, setStartDepth] = useState(startOptions.length - 1);
  const startPath = startOptions[startDepth]?.path ?? tree.position;
  const branches = useMemo(
    () => getPositionSolutionBranches(tree, startOptions[startDepth]?.path ?? tree.position),
    [tree, startOptions, startDepth],
  );
  // A start on the board path keeps the move played on the board as the proposed solution.
  const initialBranch = (depth: number, options: PositionSolutionBranch[]) =>
    depth < tree.position.length ? tree.position[depth] : (options[0]?.childIndex ?? -1);
  const [target, setTarget] = useState(NEW_TARGET);
  const [name, setName] = useState(t("PositionActions.TacticsSetName", "Board positions"));
  const [title, setTitle] = useState(sourceLabel);
  const [branchIndex, setBranchIndex] = useState(() => initialBranch(startDepth, branches));
  /** Plies of the solution to keep; null keeps the whole continuation. */
  const [solutionPlies, setSolutionPlies] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [variationPolicy, setVariationPolicy] = useState<TacticsVariationPolicy>("mainline");
  const [startingActor, setStartingActor] = useState<TacticsStartingActor>("student");
  const [error, setError] = useState("");

  const targets = Object.values(areas.tactics.sets)
    .filter((set) => set.origin === "user" && set.source?.kind !== "pgnFile")
    .map((set) => ({ value: set.id, label: set.name }));
  const selectedBranch = branches.find((branch) => branch.childIndex === branchIndex);
  const keptPlies = Math.min(
    solutionPlies ?? selectedBranch?.continuationPlies ?? 0,
    selectedBranch?.continuationPlies ?? 0,
  );

  function changeStart(depth: number) {
    const path = startOptions[depth]?.path ?? tree.position;
    setStartDepth(depth);
    setBranchIndex(initialBranch(depth, getPositionSolutionBranches(tree, path)));
    setSolutionPlies(null);
    setConfirmed(false);
  }

  function createCopy() {
    setError("");
    try {
      const record = createPositionTacticsRecord(
        tree,
        branchIndex,
        title.trim() || sourceLabel,
        sourceLabel,
        { startPath, solutionPlies: keptPlies },
      );
      setAreas((current) => ({
        ...current,
        tactics:
          target === NEW_TARGET
            ? addTacticsSet(current.tactics, name.trim() || sourceLabel, "", [record], {
                config: { variationPolicy, startingActor },
              })
            : addTacticsExerciseToSet(current.tactics, target, record, ["board-position"]),
      }));
      notifications.show({
        color: "green",
        message: t("PositionActions.TacticsCreated", "The tactical copy was added."),
      });
      onCreated();
    } catch (cause) {
      setError(String(cause));
    }
  }

  const startSelect = (
    <Select
      label={t("PositionActions.StartPosition", "Start of the tactic")}
      description={t(
        "PositionActions.StartPositionDescription",
        "The exercise starts from this position of the game.",
      )}
      searchable
      value={String(startDepth)}
      onChange={(value) => value !== null && changeStart(Number(value))}
      data={startOptions
        .map((option, depth) => {
          const label =
            option.san === null
              ? t("PositionActions.GameStart", "Start of the game")
              : t("PositionActions.AfterMove", "After {{move}}", {
                  move: formatMove(option.san, option.halfMoves),
                });
          return {
            value: String(depth),
            label:
              depth === startOptions.length - 1
                ? `${label} · ${t("PositionActions.CurrentPosition", "displayed position")}`
                : label,
          };
        })
        .reverse()}
    />
  );

  if (branches.length === 0) {
    return (
      <Stack>
        {startSelect}
        <Alert color="yellow">
          {t(
            "PositionActions.NoSolution",
            "This position has no analyzed continuation. Add the solution and its variations to the board before creating a tactical copy.",
          )}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack>
      <Alert color="blue">
        {t(
          "PositionActions.TacticsReview",
          "Choose the prepared continuation that represents the solution. The copied PGN keeps the other analyzed variations for the set's validation policy.",
        )}
      </Alert>
      {error && <Alert color="red">{error}</Alert>}
      <Select
        label={t("Studies.TacticsTarget", "Tactics set")}
        value={target}
        onChange={(value) => setTarget(value ?? NEW_TARGET)}
        data={[
          { value: NEW_TARGET, label: t("Studies.CreateNewSet", "Create a new set") },
          ...targets,
        ]}
      />
      {target === NEW_TARGET && (
        <>
          <TextInput
            label={t("PositionActions.SetName", "Set name")}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Group grow>
            <Select
              label={t("Studies.SolutionBranches", "Accepted solution branches")}
              value={variationPolicy}
              onChange={(value) =>
                setVariationPolicy((value as TacticsVariationPolicy) ?? "mainline")
              }
              data={[
                { value: "mainline", label: t("Studies.MainLine", "Main line only") },
                {
                  value: "opponentResponses",
                  label: t("Studies.OpponentResponses", "All opponent responses"),
                },
                { value: "all", label: t("Studies.AllBranches", "All variations") },
              ]}
            />
            <Select
              label={t("Studies.FirstActor", "First actor")}
              value={startingActor}
              onChange={(value) => setStartingActor((value as TacticsStartingActor) ?? "student")}
              data={[
                { value: "student", label: t("Studies.Student", "Student") },
                { value: "opponent", label: t("Studies.Opponent", "Opponent") },
              ]}
            />
          </Group>
        </>
      )}
      <TextInput
        label={t("PositionActions.ExerciseName", "Exercise name")}
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />
      {startSelect}
      <Select
        label={t("PositionActions.PreparedSolution", "Prepared solution")}
        value={String(branchIndex)}
        onChange={(value) => {
          setBranchIndex(Number(value));
          setSolutionPlies(null);
          setConfirmed(false);
        }}
        data={branches.map((branch) => ({
          value: String(branch.childIndex),
          label:
            branch.continuationSan.slice(0, BRANCH_PREVIEW_PLIES).join(" ") +
            (branch.continuationSan.length > BRANCH_PREVIEW_PLIES ? " …" : ""),
        }))}
      />
      {selectedBranch && (
        <Select
          label={t("PositionActions.EndMove", "Last move of the solution")}
          description={t(
            "PositionActions.EndMoveDescription",
            "Moves after this one are not copied.",
          )}
          searchable
          value={String(keptPlies)}
          onChange={(value) => {
            if (value === null) return;
            setSolutionPlies(Number(value));
            setConfirmed(false);
          }}
          data={selectedBranch.moves.map((move, index) => ({
            value: String(index + 1),
            label: formatMove(move.san, move.halfMoves),
          }))}
        />
      )}
      {selectedBranch && (
        <Text size="sm" c="dimmed">
          {t("PositionActions.SolutionPlies", "{{count}} prepared plies.", {
            count: keptPlies,
          })}
        </Text>
      )}
      <Checkbox
        checked={confirmed}
        onChange={(event) => setConfirmed(event.currentTarget.checked)}
        label={t(
          "PositionActions.ConfirmSolution",
          "I confirm that this continuation is a valid solution from the displayed position.",
        )}
      />
      <Button
        disabled={
          !confirmed || branchIndex < 0 || !title.trim() || (target === NEW_TARGET && !name.trim())
        }
        onClick={createCopy}
      >
        {t("Studies.CreateCopy", "Create copy")}
      </Button>
    </Stack>
  );
}
