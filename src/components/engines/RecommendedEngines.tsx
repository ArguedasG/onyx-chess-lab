import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  List,
  Paper,
  Progress,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { IconBrain, IconCheck, IconCpu, IconDownload, IconPlus, IconX } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";
import { Modal } from "@/components/common/Modal";
import { useProgress } from "@/hooks/useProgress";
import {
  engineSetupOpenAtom,
  type RecommendedEngine,
  useRecommendedEngines,
} from "@/hooks/useRecommendedEngines";
import { RECOMMENDED_STOCKFISH_PROGRESS_ID } from "@/utils/engineSetup";
import { MANAGED_MAIA_PROGRESS_ID } from "@/utils/managedMaia";
import { useAtom } from "jotai";

function EngineRow({
  icon,
  name,
  description,
  installed,
  installing,
  failed,
  error,
  progressId,
  onCancel,
}: {
  icon: ReactNode;
  name: string;
  description: string;
  installed: boolean;
  installing: boolean;
  failed: boolean;
  /** Why the last attempt failed. */
  error?: string | null;
  progressId: string;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const { progress } = useProgress(progressId);
  return (
    <Paper withBorder radius="md" p="sm">
      <Group wrap="nowrap" align="flex-start" gap="sm">
        <ThemeIcon size={36} radius="md" variant="light" color={installed ? "teal" : "gray"}>
          {icon}
        </ThemeIcon>
        <Box flex={1} miw={0}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text fw={600} size="sm">
              {name}
            </Text>
            {installed ? (
              <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
                {t("Common.Installed")}
              </Badge>
            ) : installing ? (
              <Group gap={4} wrap="nowrap">
                <Badge color="blue" variant="light">
                  {progress > 0 ? `${Math.round(progress)} %` : t("EngineSetup.Installing")}
                </Badge>
                {onCancel && (
                  <Tooltip label={t("Common.Cancel")}>
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={onCancel}>
                      <IconX size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            ) : failed ? (
              <Badge color="red" variant="light">
                {t("EngineSetup.Failed")}
              </Badge>
            ) : (
              <Badge color="gray" variant="light">
                {t("EngineSetup.NotInstalled")}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" mt={2}>
            {description}
          </Text>
          {failed && !installed && !installing && error && (
            <Text size="xs" c="red" mt={4} style={{ overflowWrap: "anywhere" }}>
              {error}
            </Text>
          )}
          {installing && <Progress value={progress} size="sm" mt="xs" animated={progress === 0} />}
        </Box>
      </Group>
    </Paper>
  );
}

/**
 * Stockfish and Maia 3 with their state and one button that installs whatever is missing. Used in
 * the engine setup dialog, the Add engine dialog and the first steps of the home screen.
 */
export function RecommendedEngines({ focus }: { focus?: RecommendedEngine }) {
  const { t } = useTranslation();
  const setup = useRecommendedEngines();
  const showMaia = setup.maiaAvailable;
  const missing = [!setup.hasStockfish && "stockfish", showMaia && !setup.hasMaia && "maia"].filter(
    Boolean,
  ) as RecommendedEngine[];

  const buttonLabel =
    missing.length === 2
      ? t("EngineSetup.InstallBoth")
      : missing[0] === "stockfish"
        ? t("EngineSetup.InstallStockfish")
        : t("EngineSetup.InstallMaia");

  const stockfishRow = (
    <EngineRow
      key="stockfish"
      icon={<IconCpu size={20} />}
      name="Stockfish"
      description={t("EngineSetup.StockfishDesc")}
      installed={setup.hasStockfish}
      installing={setup.state.stockfish === "installing"}
      failed={setup.state.stockfish === "error"}
      error={setup.errors.stockfish}
      progressId={RECOMMENDED_STOCKFISH_PROGRESS_ID}
    />
  );
  const maiaRow = showMaia && (
    <EngineRow
      key="maia"
      icon={<IconBrain size={20} />}
      name="Maia 3"
      description={t("EngineSetup.MaiaDesc")}
      installed={setup.hasMaia}
      installing={setup.state.maia === "installing"}
      failed={setup.state.maia === "error"}
      error={setup.errors.maia}
      progressId={MANAGED_MAIA_PROGRESS_ID}
      onCancel={() => void commands.cancelManagedMaiaInstall(MANAGED_MAIA_PROGRESS_ID)}
    />
  );

  return (
    <Stack gap="sm">
      {focus === "maia" ? [maiaRow, stockfishRow] : [stockfishRow, maiaRow]}
      {missing.length > 0 ? (
        <>
          <Button
            leftSection={<IconDownload size={16} />}
            loading={setup.installing}
            onClick={() => void setup.installMissing()}
          >
            {buttonLabel}
          </Button>
          <Text size="xs" c="dimmed" ta="center">
            {setup.installing ? t("EngineSetup.KeepUsing") : t("EngineSetup.Space")}
          </Text>
        </>
      ) : (
        <Text size="sm" c="teal" ta="center" fw={500}>
          {t("EngineSetup.AllReady")}
        </Text>
      )}
      {setup.state.stockfish === "error" && !setup.hasStockfish && (
        <ManualStockfishSteps os={setup.os} />
      )}
      {!showMaia && setup.os && (
        <Text size="xs" c="dimmed">
          {t("EngineSetup.MaiaManual")}
        </Text>
      )}
    </Stack>
  );
}

const STOCKFISH_DOWNLOAD_PAGE = "https://stockfishchess.org/download/";

/** The Stockfish file to choose after unzipping the official download, per system. */
function stockfishFile(os: string | undefined) {
  if (os === "macos") return "stockfish/stockfish-macos-universal";
  if (os === "linux") return "stockfish/stockfish-linux-x86-64-universal";
  return "stockfish/stockfish-windows-x86-64-universal.exe";
}

/** When the automatic installation fails, how to do it by hand, right where it failed. */
function ManualStockfishSteps({ os }: { os: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setOpen] = useAtom(engineSetupOpenAtom);
  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="sm" fw={600} mb={6}>
        {t("EngineSetup.Manual.Title", "Install it by hand")}
      </Text>
      <List type="ordered" size="sm" spacing={4}>
        <List.Item>
          {t("EngineSetup.Manual.Download", "Download Stockfish for your system from")}{" "}
          <Anchor size="sm" onClick={() => void openUrl(STOCKFISH_DOWNLOAD_PAGE)}>
            stockfishchess.org/download
          </Anchor>{" "}
          {t("EngineSetup.Manual.Unzip", "and unzip it.")}
        </List.Item>
        <List.Item>
          {t(
            "EngineSetup.Manual.Add",
            "Press “Add it by hand”, open the Local tab and choose the file {{file}} from the unzipped folder.",
            { file: stockfishFile(os) },
          )}
        </List.Item>
        {os === "macos" && (
          <List.Item>
            {t(
              "EngineSetup.Manual.Mac",
              "If macOS says the developer cannot be verified, open System Settings → Privacy & Security and choose “Open Anyway”.",
            )}
          </List.Item>
        )}
      </List>
      <Button
        mt="sm"
        size="xs"
        variant="light"
        leftSection={<IconPlus size={14} />}
        onClick={() => {
          setOpen(false);
          void navigate({ to: "/engines", search: { add: true } });
        }}
      >
        {t("EngineSetup.Manual.Button", "Add it by hand")}
      </Button>
    </Paper>
  );
}

/** Mounted once in the app: any "install Maia" or "install Stockfish" notice opens it in place. */
export function EngineSetupModal() {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(engineSetupOpenAtom);
  return (
    <Modal
      opened={open !== false}
      onClose={() => setOpen(false)}
      title={t("EngineSetup.Title")}
      centered
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t("EngineSetup.Intro")}
        </Text>
        <RecommendedEngines focus={typeof open === "string" ? open : undefined} />
      </Stack>
    </Modal>
  );
}
