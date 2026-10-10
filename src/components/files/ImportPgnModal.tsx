import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { IconFileImport, IconX } from "@tabler/icons-react";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, writeTextFile } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { capitalize } from "@/utils/format";
import { samePath } from "@/utils/pgnUsage";
import { unwrap } from "@/utils/unwrap";
import type { FileMetadata, FileType } from "./file";

const FILE_TYPES: FileType[] = ["game", "repertoire", "tournament", "puzzle", "other"];

function baseName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

/** "Name.pgn", then "Name (2).pgn", ... so an import never overwrites an existing file. */
async function availablePgnPath(dir: string, name: string) {
  let candidate = await join(dir, `${name}.pgn`);
  for (let copy = 2; await exists(candidate); copy++) {
    candidate = await join(dir, `${name} (${copy}).pgn`);
  }
  return candidate;
}

export default function ImportPgnModal({
  opened,
  onClose,
  initialPaths,
  initialType,
  targetDir,
  targetLabel,
  onImported,
}: {
  opened: boolean;
  onClose: () => void;
  /** Files dropped on the page; the picker is used when empty. */
  initialPaths: string[];
  initialType: FileType;
  targetDir: string;
  targetLabel: string;
  onImported: (files: FileMetadata[]) => void;
}) {
  const { t } = useTranslation();
  const [paths, setPaths] = useState<string[]>([]);
  const [filetype, setFiletype] = useState<FileType>(initialType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!opened) return;
    setPaths(initialPaths);
    setFiletype(initialType);
    setError("");
  }, [opened, initialPaths, initialType]);

  async function choose() {
    const selected = await open({
      multiple: true,
      filters: [{ name: "PGN", extensions: ["pgn"] }],
    });
    if (!selected) return;
    const picked = Array.isArray(selected) ? selected : [selected];
    setPaths((current) => [...current, ...picked.filter((path) => !current.includes(path))]);
  }

  async function importFiles() {
    setBusy(true);
    setError("");
    const imported: FileMetadata[] = [];
    const failed: { path: string; message: string }[] = [];
    for (const source of paths) {
      try {
        const name = baseName(source).replace(/\.pgn$/i, "");
        // A file that already lives in the destination is registered, not duplicated.
        const alreadyHere = samePath(await join(targetDir, baseName(source)), source);
        const target = alreadyHere ? source : await availablePgnPath(targetDir, name);
        if (!alreadyHere) await copyFile(source, target);
        const metadata = { type: filetype, tags: [] };
        await writeTextFile(target.replace(/\.pgn$/i, ".info"), JSON.stringify(metadata));
        imported.push({
          type: "file",
          name: baseName(target).replace(/\.pgn$/i, ""),
          path: target,
          numGames: unwrap(await commands.countPgnGames(target)),
          metadata,
          lastModified: Date.now(),
        });
      } catch (cause) {
        failed.push({ path: source, message: `${baseName(source)}: ${String(cause)}` });
      }
    }
    setBusy(false);
    if (imported.length > 0) onImported(imported);
    if (failed.length > 0) {
      // Keep only what failed, so retrying does not import the others twice.
      setPaths(failed.map((entry) => entry.path));
      setError(failed.map((entry) => entry.message).join("\n"));
    } else {
      onClose();
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={() => !busy && onClose()}
      title={t("Files.Import.Title", "Import PGN files")}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t(
            "Files.Import.Description",
            "A copy is saved in {{folder}}; the original stays where it is. Afterwards you can send it to a study, a repertoire or a training set.",
            { folder: targetLabel },
          )}
        </Text>
        {error && (
          <Alert color="red" style={{ whiteSpace: "pre-wrap" }}>
            {error}
          </Alert>
        )}
        <Button
          variant="default"
          leftSection={<IconFileImport size={16} />}
          onClick={choose}
          disabled={busy}
        >
          {paths.length > 0
            ? t("Files.Import.AddMore", "Add more files")
            : t("Files.Import.Choose", "Choose PGN files")}
        </Button>
        {paths.length > 0 && (
          <Stack gap={4}>
            {paths.map((path) => (
              <Group key={path} justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm" truncate title={path}>
                  {baseName(path)}
                </Text>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  disabled={busy}
                  aria-label={t("Common.Remove", "Remove")}
                  onClick={() => setPaths((current) => current.filter((entry) => entry !== path))}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
        <div>
          <Text fz="sm" fw="bold" mb={4}>
            {t("Files.FileType")}
          </Text>
          <SegmentedControl
            fullWidth
            size="xs"
            value={filetype}
            disabled={busy}
            onChange={(value) => setFiletype(value as FileType)}
            data={FILE_TYPES.map((type) => ({
              value: type,
              label: t(`Files.FileType.${capitalize(type)}`),
            }))}
          />
        </div>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            {t("Common.Cancel")}
          </Button>
          <Button loading={busy} disabled={paths.length === 0} onClick={importFiles}>
            {t("Files.Import.Confirm", "Import {{count}}", { count: paths.length })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
