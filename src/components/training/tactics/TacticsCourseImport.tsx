import { useTranslation as useTrainingTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { type ReactNode, useEffect, useState } from "react";
import { Modal } from "@/components/common/Modal";
import type { TacticsCourseFile } from "@/utils/tacticsTraining";

export type TacticsCourseScan = { directory: string; name: string; files: TacticsCourseFile[] };

/**
 * Review of a folder before importing it as a course: one set per checked PGN, in file order.
 * Files that look like the whole book or another course start unchecked (see
 * `planTacticsCourseFiles`).
 */
export default function TacticsCourseImport({
  scan,
  existingCourses,
  configFields,
  onClose,
  onImport,
}: {
  scan: TacticsCourseScan | null;
  existingCourses: string[];
  /** The set options (mode, validation…), applied to every imported set. */
  configFields: ReactNode;
  onClose: () => void;
  onImport: (courseName: string, files: TacticsCourseFile[]) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const [name, setName] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!scan) return;
    setName(scan.name);
    setChecked(new Set(scan.files.filter((file) => file.suggested).map((file) => file.path)));
  }, [scan]);

  if (!scan) return null;
  const selected = scan.files.filter((file) => checked.has(file.path));
  const puzzles = selected.reduce((sum, file) => sum + file.recordCount, 0);
  const skippedSuggestion = scan.files.some((file) => file.recordCount > 0 && !file.suggested);
  const merges = existingCourses.includes(name.trim());

  function toggle(path: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={trainingT("Tactics.Course.ImportTitle", "Import a folder of PGNs")}
      size="lg"
    >
      <Stack>
        <TextInput
          label={trainingT("Tactics.Course.Name", "Folder name")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          description={
            merges
              ? trainingT(
                  "Tactics.Course.Merges",
                  "A folder with this name exists: the new sets are added to its end.",
                )
              : undefined
          }
        />
        {scan.files.length === 0 ? (
          <Alert color="yellow">
            {trainingT("Tactics.Course.NoPgn", "This folder has no PGN files.")}
          </Alert>
        ) : (
          <>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {trainingT(
                  "Tactics.Course.Hint",
                  "Each checked PGN becomes a set in the folder, in this order.",
                )}
              </Text>
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() =>
                    setChecked(
                      new Set(
                        scan.files.filter((file) => file.recordCount > 0).map((file) => file.path),
                      ),
                    )
                  }
                >
                  {trainingT("Tactics.Course.All", "All")}
                </Button>
                <Button size="compact-xs" variant="subtle" onClick={() => setChecked(new Set())}>
                  {trainingT("Tactics.Course.None", "None")}
                </Button>
              </Group>
            </Group>
            {skippedSuggestion && (
              <Alert color="blue">
                {trainingT(
                  "Tactics.Course.Unnumbered",
                  "Files without a number were left unchecked: they are usually the whole book or another course. Check them if they belong here.",
                )}
              </Alert>
            )}
            <ScrollArea.Autosize mah={300}>
              <Stack gap={6} pr="sm">
                {scan.files.map((file) => (
                  <Group key={file.path} justify="space-between" wrap="nowrap">
                    <Checkbox
                      checked={checked.has(file.path)}
                      disabled={file.recordCount === 0}
                      onChange={() => toggle(file.path)}
                      label={file.filename}
                    />
                    <Badge
                      variant="light"
                      color={file.error ? "red" : file.recordCount === 0 ? "gray" : "orange"}
                    >
                      {file.error
                        ? trainingT("Tactics.Course.Unreadable", "Unreadable")
                        : trainingT("Tactics.Course.Puzzles", "{{n}} puzzles", {
                            n: file.recordCount.toLocaleString(),
                          })}
                    </Badge>
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </>
        )}
        {configFields}
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {trainingT("Tactics.Course.Summary", "{{themes}} sets · {{puzzles}} puzzles", {
              themes: selected.length,
              puzzles: puzzles.toLocaleString(),
            })}
          </Text>
          <Group>
            <Button variant="default" onClick={onClose}>
              {trainingT("Training.Copy.Cancel.bb9dbb40", "Cancel")}
            </Button>
            <Button
              color="orange"
              disabled={selected.length === 0 || !name.trim()}
              onClick={() => onImport(name.trim(), selected)}
            >
              {trainingT("Tactics.Course.Import", "Import folder")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
