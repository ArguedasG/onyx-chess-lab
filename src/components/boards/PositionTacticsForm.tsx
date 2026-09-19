import { Alert, Button, Checkbox, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { createPositionTacticsRecord, getPositionSolutionBranches } from "@/utils/positionActions";
import {
  addTacticsExerciseToSet,
  addTacticsSet,
  type TacticsStartingActor,
  type TacticsVariationPolicy,
} from "@/utils/trainingAreas";
import type { TreeState } from "@/utils/treeReducer";

const NEW_TARGET = "__new__";

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
  const branches = useMemo(() => getPositionSolutionBranches(tree), [tree]);
  const [target, setTarget] = useState(NEW_TARGET);
  const [name, setName] = useState(t("PositionActions.TacticsSetName", "Board positions"));
  const [title, setTitle] = useState(sourceLabel);
  const [branchIndex, setBranchIndex] = useState(branches[0]?.childIndex ?? -1);
  const [confirmed, setConfirmed] = useState(false);
  const [variationPolicy, setVariationPolicy] = useState<TacticsVariationPolicy>("mainline");
  const [startingActor, setStartingActor] = useState<TacticsStartingActor>("student");
  const [error, setError] = useState("");

  const targets = Object.values(areas.tactics.sets)
    .filter((set) => set.origin === "user" && set.source?.kind !== "pgnFile")
    .map((set) => ({ value: set.id, label: set.name }));
  const selectedBranch = branches.find((branch) => branch.childIndex === branchIndex);

  function createCopy() {
    setError("");
    try {
      const record = createPositionTacticsRecord(
        tree,
        branchIndex,
        title.trim() || sourceLabel,
        sourceLabel,
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

  if (branches.length === 0) {
    return (
      <Alert color="yellow">
        {t(
          "PositionActions.NoSolution",
          "This position has no analyzed continuation. Add the solution and its variations to the board before creating a tactical copy.",
        )}
      </Alert>
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
      <Select
        label={t("PositionActions.PreparedSolution", "Prepared solution")}
        value={String(branchIndex)}
        onChange={(value) => {
          setBranchIndex(Number(value));
          setConfirmed(false);
        }}
        data={branches.map((branch) => ({
          value: String(branch.childIndex),
          label: branch.continuationSan.join(" "),
        }))}
      />
      {selectedBranch && (
        <Text size="sm" c="dimmed">
          {t("PositionActions.SolutionPlies", "{{count}} prepared plies.", {
            count: selectedBranch.continuationPlies,
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
