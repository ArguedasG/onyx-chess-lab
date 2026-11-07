import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/common/Modal";
import type { TacticsSet } from "@/utils/trainingAreas";

/** "new": name a course and pick its sets; "add": pick sets for an existing course. */
export type CoursePickerMode = { kind: "new" } | { kind: "add"; courseName: string };

/**
 * Picks sets for a course, in the order they are checked: any set can go in, a loose one or one
 * from another course (it then moves). Sets already in the target course are not listed.
 */
export default function CourseSetsPicker({
  mode,
  sets,
  existingCourses,
  onClose,
  onConfirm,
}: {
  mode: CoursePickerMode | null;
  sets: TacticsSet[];
  existingCourses: string[];
  onClose: () => void;
  onConfirm: (courseName: string, setIds: string[]) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!mode) return;
    setName(mode.kind === "add" ? mode.courseName : "");
    setQuery("");
    setPicked([]);
  }, [mode]);

  if (!mode) return null;
  const target = name.trim();
  const needle = query.trim().toLowerCase();
  const candidates = sets
    .filter((set) => !target || set.course?.name !== target)
    .filter(
      (set) =>
        !needle ||
        set.name.toLowerCase().includes(needle) ||
        set.course?.name.toLowerCase().includes(needle),
    )
    // Loose sets first: they are the usual material for a new course.
    .sort((a, b) => Number(Boolean(a.course)) - Number(Boolean(b.course)));
  const moving = picked.filter((id) => {
    const course = sets.find((set) => set.id === id)?.course?.name;
    return course && course !== target;
  }).length;

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      title={
        mode.kind === "new"
          ? trainingT("Tactics.Course.New", "New folder")
          : trainingT("Tactics.Course.AddSetsTo", "Add sets to “{{name}}”", {
              name: mode.courseName,
            })
      }
    >
      <Stack>
        {mode.kind === "new" && (
          <Autocomplete
            label={trainingT("Tactics.Course.Name", "Folder name")}
            placeholder={trainingT("Tactics.Course.NamePlaceholder", "e.g. Tactics by theme")}
            data={existingCourses}
            value={name}
            onChange={setName}
            data-autofocus
          />
        )}
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder={trainingT("Tactics.Course.Search", "Search sets")}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          {trainingT(
            "Tactics.Course.PickHint",
            "Check the sets in the order you want them in the folder. Each set keeps its progress.",
          )}
        </Text>
        <ScrollArea.Autosize mah={340}>
          <Stack gap={6} pr="sm">
            {candidates.length === 0 ? (
              <Text size="sm" c="dimmed">
                {trainingT("Tactics.Course.NoCandidates", "No sets to add.")}
              </Text>
            ) : (
              candidates.map((set) => {
                const place = picked.indexOf(set.id);
                return (
                  <Group key={set.id} justify="space-between" wrap="nowrap">
                    <Checkbox
                      checked={place >= 0}
                      onChange={() => toggle(set.id)}
                      label={place >= 0 ? `${place + 1}. ${set.name}` : set.name}
                    />
                    {set.course && (
                      <Badge variant="light" color="gray" style={{ flexShrink: 0 }}>
                        {set.course.name}
                      </Badge>
                    )}
                  </Group>
                );
              })
            )}
          </Stack>
        </ScrollArea.Autosize>
        {moving > 0 && (
          <Text size="xs" c="dimmed">
            {trainingT(
              "Tactics.Course.Moving",
              "{{n}} of the checked sets will leave their current folder.",
              { n: moving },
            )}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}
          </Button>
          <Button
            color="orange"
            disabled={!target || picked.length === 0}
            onClick={() => onConfirm(target, picked)}
          >
            {mode.kind === "new"
              ? trainingT("Tactics.Course.Create", "Create folder")
              : trainingT("Tactics.Course.AddSets", "Add sets")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
