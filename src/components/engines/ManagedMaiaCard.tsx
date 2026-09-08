import {
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrain, IconDatabase, IconShieldCheck, IconTrophy } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  commands,
  type ManagedMaiaInstallation,
  type ManagedMaiaStatus,
  type Result,
} from "@/bindings";
import { enginesAtom } from "@/state/atoms";
import { getEnginesDir } from "@/utils/directories";
import { type LocalEngine } from "@/utils/engines";
import {
  isManagedMaia,
  MANAGED_MAIA_PROGRESS_ID,
  managedMaiaToLocalEngine,
} from "@/utils/managedMaia";
import ProgressButton from "../common/ProgressButton";

function resultValue<T>(result: Result<T, string>): T {
  if (result.status === "ok") return result.data;
  throw new Error(result.error);
}

const DEFAULT_INSTALLATION: Pick<
  ManagedMaiaInstallation,
  | "name"
  | "version"
  | "elo"
  | "installedSizeMb"
  | "requiredFreeSpaceMb"
  | "sourceUrl"
  | "modelUrl"
  | "license"
> = {
  name: "Maia 3 5M",
  version: "0.1.0",
  elo: 2600,
  installedSizeMb: 660,
  requiredFreeSpaceMb: 1500,
  sourceUrl: "https://github.com/CSSLab/maia3",
  modelUrl: "https://huggingface.co/UofTCSSLab/Maia3-5M",
  license: "AGPL-3.0",
};

export default function ManagedMaiaCard({ opened }: { opened: boolean }) {
  const { t } = useTranslation();
  const [allEngines, setEngines] = useAtom(enginesAtom);
  const [status, setStatus] = useState<ManagedMaiaStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [inProgress, setInProgress] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const installation = status?.installation ?? DEFAULT_INSTALLATION;
  const registered = (allEngines ?? []).some(
    (engine) => engine.type === "local" && isManagedMaia(engine),
  );
  const ready = Boolean(status?.installed && registered);
  const needsRegistration = Boolean(status?.installed && !registered);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const enginesDir = await getEnginesDir();
      setStatus(resultValue(await commands.getManagedMaiaStatus(enginesDir)));
    } catch (error) {
      notifications.show({
        color: "red",
        title: t("Engines.ManagedMaia.StatusFailed"),
        message: String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (opened) void refreshStatus();
  }, [opened, refreshStatus]);

  const registerInstallation = useCallback(
    async (installed: ManagedMaiaInstallation) => {
      const config = resultValue(await commands.getEngineConfig(installed.path, installed.args));
      setEngines(async (previous) => {
        const engines = await previous;
        const existing = engines.find(
          (engine): engine is LocalEngine => engine.type === "local" && isManagedMaia(engine),
        );
        const registered = managedMaiaToLocalEngine(installed, config.options, existing?.id);
        return [...engines.filter((engine) => engine !== existing), registered];
      });
    },
    [setEngines],
  );

  const install = useCallback(async () => {
    setInProgress(true);
    setCancelRequested(false);
    try {
      const enginesDir = await getEnginesDir();
      const result = resultValue(
        await commands.installManagedMaia(
          MANAGED_MAIA_PROGRESS_ID,
          enginesDir,
          Boolean(ready || status?.needsRepair),
        ),
      );
      await registerInstallation(result);
      setStatus({ installed: true, needsRepair: false, installation: result });
      notifications.show({
        color: "green",
        message: t("Engines.ManagedMaia.InstallSuccess"),
      });
    } catch (error) {
      await commands.clearProgress(MANAGED_MAIA_PROGRESS_ID);
      const message = String(error);
      if (message.toLowerCase().includes("cancelled")) {
        notifications.show({ color: "yellow", message: t("Engines.ManagedMaia.Cancelled") });
      } else {
        notifications.show({
          color: "red",
          title: t("Engines.ManagedMaia.InstallFailed"),
          message,
        });
      }
      await refreshStatus();
    } finally {
      setCancelRequested(false);
      setInProgress(false);
    }
  }, [ready, refreshStatus, registerInstallation, status, t]);

  const uninstall = useCallback(async () => {
    try {
      const enginesDir = await getEnginesDir();
      resultValue(await commands.uninstallManagedMaia(enginesDir));
      setEngines(async (previous) =>
        (await previous).filter((engine) => !(engine.type === "local" && isManagedMaia(engine))),
      );
      setStatus({ installed: false, needsRepair: false, installation: null });
      setConfirmUninstall(false);
      await commands.clearProgress(MANAGED_MAIA_PROGRESS_ID);
      notifications.show({ color: "green", message: t("Engines.ManagedMaia.UninstallSuccess") });
    } catch (error) {
      notifications.show({
        color: "red",
        title: t("Engines.ManagedMaia.UninstallFailed"),
        message: String(error),
      });
    }
  }, [setEngines, t]);

  return (
    <>
      <Paper withBorder radius="md" p="sm">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <Group gap="xs" wrap="nowrap">
              <IconBrain size="1.5rem" />
              <Box>
                <Text fw="bold" size="sm">
                  {installation.name} {installation.version}
                </Text>
                <Text size="xs" c="dimmed">
                  {t("Engines.ManagedMaia.Description")}
                </Text>
              </Box>
            </Group>
            {loading ? (
              <Skeleton h={20} w={70} />
            ) : cancelRequested ? (
              <Badge color="yellow">{t("Engines.ManagedMaia.Cancelling")}</Badge>
            ) : inProgress ? (
              <Badge color="blue">{t("Engines.ManagedMaia.Installing")}</Badge>
            ) : ready ? (
              <Badge color="green">{t("Common.Installed")}</Badge>
            ) : needsRegistration ? (
              <Badge color="blue">{t("Engines.ManagedMaia.ReadyToAdd")}</Badge>
            ) : status?.needsRepair ? (
              <Badge color="yellow">{t("Engines.ManagedMaia.NeedsRepair")}</Badge>
            ) : (
              <Badge color="blue">{t("Engines.ManagedMaia.Managed")}</Badge>
            )}
          </Group>

          <Group gap="md">
            <Group gap={4} wrap="nowrap">
              <IconTrophy size="1rem" />
              <Text size="xs">600–{installation.elo} ELO</Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <IconDatabase size="1rem" />
              <Text size="xs">
                {t("Engines.ManagedMaia.Size", { size: installation.installedSizeMb })}
              </Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <IconShieldCheck size="1rem" />
              <Text size="xs">{installation.license}</Text>
            </Group>
          </Group>

          <Text size="xs" c="dimmed">
            {t("Engines.ManagedMaia.Space", { size: installation.requiredFreeSpaceMb })}
          </Text>
          <Text size="xs" c="dimmed">
            {t("Engines.ManagedMaia.Duration")}
          </Text>
          <Group gap="xs">
            <Anchor href={installation.sourceUrl} target="_blank" rel="noreferrer" size="xs">
              {t("Engines.ManagedMaia.Source")}
            </Anchor>
            <Anchor href={installation.modelUrl} target="_blank" rel="noreferrer" size="xs">
              {t("Engines.ManagedMaia.Model")}
            </Anchor>
          </Group>

          <ProgressButton
            id={MANAGED_MAIA_PROGRESS_ID}
            initInstalled={ready}
            redoable
            disabled={loading || cancelRequested}
            labels={{
              completed: t("Engines.ManagedMaia.Repair"),
              action: needsRegistration
                ? t("Common.Add")
                : status?.needsRepair
                  ? t("Engines.ManagedMaia.Repair")
                  : t("Common.Install"),
              inProgress: t("Engines.ManagedMaia.Installing"),
              finalizing: t("Engines.ManagedMaia.Verifying"),
            }}
            finalizingAt={88}
            onClick={() => void install()}
            onCancel={() => {
              setCancelRequested(true);
              void commands.cancelManagedMaiaInstall(MANAGED_MAIA_PROGRESS_ID);
            }}
            inProgress={inProgress}
            setInProgress={setInProgress}
          />
          {(status?.installed || status?.needsRepair) && (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              disabled={inProgress || cancelRequested}
              onClick={() => setConfirmUninstall(true)}
            >
              {t("Engines.ManagedMaia.Uninstall")}
            </Button>
          )}
        </Stack>
      </Paper>

      <Modal
        centered
        opened={confirmUninstall}
        onClose={() => setConfirmUninstall(false)}
        title={t("Engines.ManagedMaia.UninstallTitle")}
      >
        <Stack>
          <Text size="sm">{t("Engines.ManagedMaia.UninstallConfirm")}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmUninstall(false)}>
              {t("Common.Cancel")}
            </Button>
            <Button color="red" onClick={() => void uninstall()}>
              {t("Engines.ManagedMaia.Uninstall")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
