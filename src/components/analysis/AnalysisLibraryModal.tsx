import { ActionIcon, Alert, Button, Group, Loader, Modal, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowsDiff, IconDownload, IconRestore, IconTrash } from "@tabler/icons-react";
import { ask, save } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  commands,
  type AnalysisArtifactDocument,
  type AnalysisArtifactKind,
  type AnalysisArtifactSummary,
} from "@/bindings";
import { unwrap } from "@/utils/unwrap";

export default function AnalysisLibraryModal({
  opened,
  onClose,
  onRestore,
  onCompare,
  restoreKind = "playerProfile",
}: {
  opened: boolean;
  onClose: () => void;
  onRestore?: (document: AnalysisArtifactDocument) => void;
  onCompare?: (document: AnalysisArtifactDocument) => void;
  restoreKind?: AnalysisArtifactKind;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<AnalysisArtifactSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(unwrap(await commands.listAnalysisArtifacts()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (opened) void refresh();
  }, [opened, refresh]);

  const showOperationError = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    setError(message);
    notifications.show({ color: "red", message });
  };

  const exportItem = async (item: AnalysisArtifactSummary) => {
    try {
      const destination = await save({
        defaultPath: `${item.title.replace(/[^a-z0-9_-]+/gi, "-") || item.id}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!destination) return;
      const path = destination.toLowerCase().endsWith(".json")
        ? destination
        : `${destination}.json`;
      unwrap(await commands.exportAnalysisArtifact(item.kind, item.id, path));
      notifications.show({
        color: "green",
        message: t("AnalysisLibrary.Exported", "Artifact exported."),
      });
    } catch (reason) {
      showOperationError(reason);
    }
  };

  const deleteItem = async (item: AnalysisArtifactSummary) => {
    try {
      const confirmed = await ask(
        t("AnalysisLibrary.DeleteConfirm", "Delete {{title}} and all its saved versions?", {
          title: item.title,
        }),
        { kind: "warning" },
      );
      if (!confirmed) return;
      unwrap(await commands.deleteAnalysisArtifact(item.kind, item.id));
      await refresh();
    } catch (reason) {
      showOperationError(reason);
    }
  };

  const restoreItem = async (item: AnalysisArtifactSummary) => {
    try {
      const document = unwrap(await commands.readAnalysisArtifact(item.kind, item.id));
      onRestore?.(document);
    } catch (reason) {
      showOperationError(reason);
    }
  };

  const compareItem = async (item: AnalysisArtifactSummary) => {
    try {
      const document = unwrap(await commands.readAnalysisArtifact(item.kind, item.id));
      onCompare?.(document);
    } catch (reason) {
      showOperationError(reason);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("AnalysisLibrary.Title", "Analysis library")}
      size="xl"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t(
            "AnalysisLibrary.Scope",
            "Versions are created only when you choose Save version. Files live in Onyx's private application data.",
          )}
        </Text>
        {loading && <Loader size="sm" />}
        {error && <Alert color="red">{error}</Alert>}
        {!loading && !error && items.length === 0 && (
          <Text c="dimmed">{t("AnalysisLibrary.Empty", "No saved versions yet.")}</Text>
        )}
        {items.length > 0 && (
          <Table.ScrollContainer minWidth={680}>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("AnalysisLibrary.Name", "Name")}</Table.Th>
                  <Table.Th>{t("AnalysisLibrary.Type", "Type")}</Table.Th>
                  <Table.Th>{t("AnalysisLibrary.Source", "Source")}</Table.Th>
                  <Table.Th>{t("AnalysisLibrary.Versions", "Versions")}</Table.Th>
                  <Table.Th>{t("AnalysisLibrary.Updated", "Updated")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>{item.title}</Table.Td>
                    <Table.Td>
                      {item.kind === "playerProfile" ? "Player profile" : "Opening report"}
                    </Table.Td>
                    <Table.Td>{item.sourceLabel}</Table.Td>
                    <Table.Td>{item.versionCount}</Table.Td>
                    <Table.Td>{new Date(item.updatedAt).toLocaleString()}</Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="end" wrap="nowrap">
                        {onRestore && item.kind === restoreKind && (
                          <ActionIcon
                            variant="subtle"
                            title={t("AnalysisLibrary.Restore", "Restore latest version")}
                            onClick={() => void restoreItem(item)}
                          >
                            <IconRestore size={16} />
                          </ActionIcon>
                        )}
                        {onCompare && item.kind === "playerProfile" && item.versionCount >= 2 && (
                          <ActionIcon
                            variant="subtle"
                            title={t("AnalysisLibrary.Compare", "Compare versions")}
                            onClick={() => void compareItem(item)}
                          >
                            <IconArrowsDiff size={16} />
                          </ActionIcon>
                        )}
                        <ActionIcon
                          variant="subtle"
                          title={t("AnalysisLibrary.Export", "Export")}
                          onClick={() => void exportItem(item)}
                        >
                          <IconDownload size={16} />
                        </ActionIcon>
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          title={t("Common.Delete", "Delete")}
                          onClick={() => void deleteItem(item)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        <Group justify="end">
          <Button variant="default" onClick={onClose}>
            {t("Common.Close", "Close")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
