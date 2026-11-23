import { Button, Group, List, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DataFolderKind, DataFolderMovePreview } from "@/bindings";
import { Modal } from "@/components/common/Modal";
import { moveDataFolder, previewDataFolderMove } from "@/utils/dataFolderMove";
import { formatBytes } from "@/utils/format";
import FileInput from "../common/FileInput";

const MAX_LISTED_CONFLICTS = 8;

/**
 * Folder picker for a data folder. When the current folder has contents, it asks whether to move
 * them to the new one, which keeps engines, databases and analysis working without reinstalling.
 */
export default function DataFolderInput({
  kind,
  value,
  onChange,
}: {
  kind: DataFolderKind;
  value: string;
  onChange: (folder: string) => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<{ to: string; preview: DataFolderMovePreview } | null>(
    null,
  );
  const [moving, setMoving] = useState(false);

  async function choose() {
    const selected = await open({ multiple: false, directory: true, defaultPath: value });
    if (!selected || typeof selected !== "string" || selected === value) return;
    if (!value) {
      onChange(selected);
      return;
    }
    try {
      const preview = await previewDataFolderMove(value, selected);
      if (preview.entries === 0) {
        onChange(selected);
        return;
      }
      setPending({ to: selected, preview });
    } catch (error) {
      notifications.show({ color: "red", message: String(error) });
    }
  }

  function useWithoutMoving() {
    if (!pending) return;
    onChange(pending.to);
    setPending(null);
  }

  async function move() {
    if (!pending) return;
    setMoving(true);
    try {
      await moveDataFolder(kind, value, pending.to);
      onChange(pending.to);
      // Everything in memory still holds the old paths; a reload reads the rewritten ones.
      window.location.reload();
    } catch (error) {
      setMoving(false);
      notifications.show({
        color: "red",
        title: t("Settings.Directories.Move.Failed", "The folder could not be moved"),
        message: String(error),
        autoClose: false,
      });
    }
  }

  const preview = pending?.preview;
  const conflicts = preview?.conflicts ?? [];

  return (
    <>
      <FileInput onClick={() => void choose()} filename={value || null} />
      <Modal
        centered
        size="lg"
        opened={pending !== null}
        onClose={() => setPending(null)}
        closeOnClickOutside={!moving}
        closeOnEscape={!moving}
        withCloseButton={!moving}
        title={t("Settings.Directories.Move.Title", "Move your data to the new folder?")}
      >
        {preview && pending && (
          <Stack gap="md">
            <Text size="sm">
              {t(
                "Settings.Directories.Move.Summary",
                "The current folder has {{files}} files ({{size}}). Onyx can move them to the new folder and update everything that points to them, so nothing has to be reinstalled or imported again.",
                {
                  files: preview.files.toLocaleString(),
                  size: formatBytes(preview.bytes, 1),
                },
              )}
            </Text>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                {t("Settings.Directories.Move.From", "From: {{folder}}", { folder: value })}
              </Text>
              <Text size="xs" c="dimmed">
                {t("Settings.Directories.Move.To", "To: {{folder}}", { folder: pending.to })}
              </Text>
            </Stack>
            {conflicts.length > 0 && (
              <Stack gap={4}>
                <Text size="sm">
                  {t(
                    "Settings.Directories.Move.Conflicts",
                    "The new folder already has these, so they will stay in the current folder:",
                  )}
                </Text>
                <List size="sm">
                  {conflicts.slice(0, MAX_LISTED_CONFLICTS).map((name) => (
                    <List.Item key={name}>{name}</List.Item>
                  ))}
                  {conflicts.length > MAX_LISTED_CONFLICTS && (
                    <List.Item>
                      {t("Settings.Directories.Move.More", "and {{count}} more", {
                        count: conflicts.length - MAX_LISTED_CONFLICTS,
                      })}
                    </List.Item>
                  )}
                </List>
              </Stack>
            )}
            {kind === "engines" && (
              <Text size="xs" c="dimmed">
                {t(
                  "Settings.Directories.Move.EnginesNote",
                  "Running analysis stops during the move. If you use Maia, Onyx will ask for a one-click Repair afterwards.",
                )}
              </Text>
            )}
            {kind === "databases" && (
              <Text size="xs" c="dimmed">
                {t(
                  "Settings.Directories.Move.DatabasesNote",
                  "Wait until any import or database analysis finishes before moving.",
                )}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              {moving
                ? t(
                    "Settings.Directories.Move.Moving",
                    "Moving… On another drive, large databases can take a few minutes.",
                  )
                : t(
                    "Settings.Directories.Move.RestartNote",
                    "Onyx reloads after the move. If you don't move them, your current data stays in the old folder.",
                  )}
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setPending(null)} disabled={moving}>
                {t("Common.Cancel", "Cancel")}
              </Button>
              <Button variant="default" onClick={useWithoutMoving} disabled={moving}>
                {t("Settings.Directories.Move.DontMove", "Use without moving")}
              </Button>
              <Button onClick={() => void move()} loading={moving}>
                {t("Settings.Directories.Move.Confirm", "Move")}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
