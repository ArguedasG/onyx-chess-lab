import { Button, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/Modal";
import { trainingAreasAtom } from "@/state/trainingAreas";
import {
  puzzleTargetSets,
  type SavablePuzzle,
  savePuzzleToSet,
  setHasPuzzle,
} from "@/utils/puzzleSets";

const NEW_SET = "__new__";

/** Saves the finished puzzle of the trainer into one of the user's tactics sets. */
export default function SavePuzzleToSetModal({
  puzzle,
  opened,
  onClose,
}: {
  puzzle: SavablePuzzle | null;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [areas, setAreas] = useAtom(trainingAreasAtom);
  const sets = puzzleTargetSets(areas.tactics).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  // The set used last is the likely one; with no set of their own, the user names a new one.
  const [target, setTarget] = useState<string | null>(null);
  const [name, setName] = useState("");
  const chosen = target ?? sets[0]?.id ?? NEW_SET;
  const alreadyThere =
    puzzle !== null && chosen !== NEW_SET ? setHasPuzzle(areas.tactics, chosen, puzzle.id) : false;
  const defaultName = t("Puzzle.SaveToSet.DefaultName", "Saved puzzles");

  function save() {
    if (!puzzle) return;
    try {
      const result = savePuzzleToSet(
        areas.tactics,
        chosen === NEW_SET
          ? {
              name: name.trim() || defaultName,
              description: t(
                "Puzzle.SaveToSet.Description",
                "Lichess puzzles saved from the trainer.",
              ),
            }
          : { setId: chosen },
        puzzle,
      );
      setAreas((current) => ({ ...current, tactics: result.state }));
      setTarget(result.setId);
      setName("");
      notifications.show({
        color: "teal",
        message: t("Puzzle.SaveToSet.Saved", "Saved in “{{name}}”.", {
          name: result.state.sets[result.setId]?.name ?? "",
        }),
      });
      onClose();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Puzzle.SaveToSet.Title", "Save puzzle in a set")}
    >
      <Stack>
        <Select
          label={t("Studies.TacticsTarget", "Tactics set")}
          value={chosen}
          onChange={(value) => value && setTarget(value)}
          allowDeselect={false}
          searchable
          data={[
            ...sets.map((set) => ({ value: set.id, label: set.name })),
            { value: NEW_SET, label: t("Studies.CreateNewSet", "Create a new set") },
          ]}
        />
        {chosen === NEW_SET && (
          <TextInput
            label={t("PositionActions.SetName", "Set name")}
            placeholder={defaultName}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        )}
        {alreadyThere && (
          <Text size="sm" c="dimmed">
            {t("Puzzle.SaveToSet.AlreadyThere", "This puzzle is already in that set.")}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Common.Cancel")}
          </Button>
          <Button disabled={!puzzle || alreadyThere} onClick={save}>
            {t("Common.Save", "Save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
