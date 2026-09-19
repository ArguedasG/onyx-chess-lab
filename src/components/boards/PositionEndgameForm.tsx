import { Alert, Button, Group, Select, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trainingAreasAtom } from "@/state/trainingAreas";
import { createPositionEndgameRecord } from "@/utils/positionActions";
import {
  addEndgamePositionToSet,
  addEndgameSet,
  inferEndgameStudentColor,
  type EndgameStudentColor,
  type TrainingObjective,
} from "@/utils/trainingAreas";
import { getNodeAtPath, type TreeState } from "@/utils/treeReducer";

const NEW_TARGET = "__new__";

export default function PositionEndgameForm({
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
  const current = getNodeAtPath(tree.root, tree.position);
  const [target, setTarget] = useState(NEW_TARGET);
  const [name, setName] = useState(t("PositionActions.EndgameSetName", "Board endgames"));
  const [title, setTitle] = useState(sourceLabel);
  const [objective, setObjective] = useState<Exclude<TrainingObjective, "unknown"> | null>(null);
  const [studentColor, setStudentColor] = useState<EndgameStudentColor>(
    inferEndgameStudentColor(current.fen),
  );
  const [error, setError] = useState("");
  const targets = Object.values(areas.endgames.sets)
    .filter((set) => set.origin === "user")
    .map((set) => ({ value: set.id, label: set.name }));

  function createCopy() {
    if (!objective) return;
    setError("");
    try {
      const record = createPositionEndgameRecord(
        tree,
        title.trim() || sourceLabel,
        sourceLabel,
        objective,
        studentColor,
      );
      setAreas((currentAreas) => ({
        ...currentAreas,
        endgames:
          target === NEW_TARGET
            ? addEndgameSet(currentAreas.endgames, name.trim() || sourceLabel, "", [record])
            : addEndgamePositionToSet(currentAreas.endgames, target, record),
      }));
      notifications.show({
        color: "green",
        message: t("PositionActions.EndgameCreated", "The endgame copy was added."),
      });
      onCreated();
    } catch (cause) {
      setError(String(cause));
    }
  }

  return (
    <Stack>
      <Alert color="blue">
        {t(
          "PositionActions.EndgameReview",
          "Confirm who trains the position and the intended result. Existing analyzed continuations are copied as reference, but Onyx does not infer the objective.",
        )}
      </Alert>
      {error && <Alert color="red">{error}</Alert>}
      <Select
        label={t("Studies.EndgameTarget", "Endgame set")}
        value={target}
        onChange={(value) => setTarget(value ?? NEW_TARGET)}
        data={[
          { value: NEW_TARGET, label: t("Studies.CreateNewSet", "Create a new set") },
          ...targets,
        ]}
      />
      {target === NEW_TARGET && (
        <TextInput
          label={t("PositionActions.SetName", "Set name")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      )}
      <TextInput
        label={t("PositionActions.PositionName", "Position name")}
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />
      <Group grow>
        <Select
          label={t("Studies.StudentColor", "Student color")}
          value={studentColor}
          onChange={(value) => setStudentColor((value as EndgameStudentColor) ?? "white")}
          data={[
            { value: "white", label: t("Fen.White", "White") },
            { value: "black", label: t("Fen.Black", "Black") },
          ]}
        />
        <Select
          label={t("Studies.Objective", "Objective")}
          value={objective}
          placeholder={t("Studies.ConfirmObjective", "Confirm objective")}
          onChange={(value) => setObjective(value as Exclude<TrainingObjective, "unknown"> | null)}
          data={[
            { value: "win", label: t("Studies.Win", "Win") },
            { value: "draw", label: t("Studies.Draw", "Draw") },
            { value: "loss", label: t("Studies.HoldOrTestLoss", "Defend / loss") },
          ]}
        />
      </Group>
      <Button
        disabled={!objective || !title.trim() || (target === NEW_TARGET && !name.trim())}
        onClick={createCopy}
      >
        {t("Studies.CreateCopy", "Create copy")}
      </Button>
    </Stack>
  );
}
