import { Button, Group, Progress, ScrollArea, Stack, Text } from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { notifications } from "@mantine/notifications";
import { getVersion } from "@tauri-apps/api/app";
import { fetch } from "@tauri-apps/plugin-http";
import { info, warn } from "@tauri-apps/plugin-log";
import { openUrl } from "@tauri-apps/plugin-opener";
import { platform } from "@tauri-apps/plugin-os";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  APP_UPDATE_CHECK_EVENT,
  EMPTY_UPDATE_PROGRESS,
  GITHUB_LATEST_RELEASE_API_URL,
  type ManualUpdateInfo,
  parseManualReleaseUpdate,
  reduceUpdateProgress,
  type AppUpdateProgress,
} from "@/utils/appUpdater";
import { ReleaseNotesView } from "@/components/WhatsNewModal";
import { playerAnalysisStorage } from "@/state/playerAnalysis";
import { trainingAreasStorage } from "@/state/trainingAreas";
import { releaseNotesForLanguage } from "@/utils/changelog";
import { formatBytes } from "@/utils/format";
import { apiHeaders } from "@/utils/http";

const UPDATE_CHECK_TIMEOUT_MS = 15_000;

export default function AppUpdater() {
  const { t, i18n } = useTranslation();
  const checking = useRef(false);
  const checkedAtStartup = useRef(false);
  const activeUpdate = useRef<Update | null>(null);
  const installingRef = useRef(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [manualUpdate, setManualUpdate] = useState<ManualUpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<AppUpdateProgress>(EMPTY_UPDATE_PROGRESS);

  const closeUpdate = useCallback(() => {
    if (installingRef.current) return;
    const current = activeUpdate.current;
    activeUpdate.current = null;
    setUpdate(null);
    setManualUpdate(null);
    setProgress(EMPTY_UPDATE_PROGRESS);
    if (current) void current.close();
  }, []);

  const checkForUpdate = useCallback(
    async (manual: boolean) => {
      if (checking.current) return;
      checking.current = true;
      try {
        if (platform() !== "windows") {
          const currentVersion = await getVersion();
          const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
            method: "GET",
            headers: apiHeaders({ Accept: "application/vnd.github+json" }),
            connectTimeout: UPDATE_CHECK_TIMEOUT_MS,
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
          }
          const payload: unknown = await response.json();
          const nextManual = parseManualReleaseUpdate(payload, currentVersion);
          if (!nextManual) {
            if (manual) {
              notifications.show({
                color: "green",
                message: t("Updater.UpToDate", "Onyx Chess Lab is up to date."),
              });
            }
            return;
          }
          setManualUpdate(nextManual);
          info(`Onyx update available: ${currentVersion} -> ${nextManual.version}`);
          return;
        }

        const next = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
        if (!next) {
          if (manual) {
            notifications.show({
              color: "green",
              message: t("Updater.UpToDate", "Onyx Chess Lab is up to date."),
            });
          }
          return;
        }

        const previous = activeUpdate.current;
        activeUpdate.current = next;
        setUpdate(next);
        setProgress(EMPTY_UPDATE_PROGRESS);
        if (previous) void previous.close();
        info(`Onyx update available: ${next.currentVersion} -> ${next.version}`);
      } catch (error) {
        warn(`Could not check for Onyx updates: ${String(error)}`);
        if (manual) {
          notifications.show({
            color: "red",
            title: t("Updater.CheckFailed", "Could not check for updates"),
            message: String(error),
          });
        }
      } finally {
        checking.current = false;
      }
    },
    [t],
  );

  useEffect(() => {
    const handleManualCheck = () => void checkForUpdate(true);
    window.addEventListener(APP_UPDATE_CHECK_EVENT, handleManualCheck);

    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    if (import.meta.env.PROD && !checkedAtStartup.current) {
      checkedAtStartup.current = true;
      startupTimer = setTimeout(() => void checkForUpdate(false), 1_500);
    }

    return () => {
      if (startupTimer) clearTimeout(startupTimer);
      window.removeEventListener(APP_UPDATE_CHECK_EVENT, handleManualCheck);
    };
  }, [checkForUpdate]);

  useEffect(
    () => () => {
      if (!installingRef.current && activeUpdate.current) void activeUpdate.current.close();
    },
    [],
  );

  const installUpdate = useCallback(async () => {
    if (!update || installingRef.current) return;
    installingRef.current = true;
    setInstalling(true);
    setProgress(EMPTY_UPDATE_PROGRESS);
    try {
      // The Windows installer closes Onyx without a close request.
      await Promise.all([trainingAreasStorage.flush(), playerAnalysisStorage.flush()]);
      await update.downloadAndInstall((event) => {
        setProgress((current) => reduceUpdateProgress(current, event));
      });
    } catch (error) {
      installingRef.current = false;
      setInstalling(false);
      warn(`Could not install Onyx update ${update.version}: ${String(error)}`);
      notifications.show({
        color: "red",
        title: t("Updater.InstallFailed", "Could not install the update"),
        message: String(error),
      });
    }
  }, [t, update]);

  const openManualDownload = useCallback(async () => {
    if (!manualUpdate) return;
    try {
      await openUrl(manualUpdate.downloadUrl);
      closeUpdate();
    } catch (error) {
      warn(`Could not open Onyx release page: ${String(error)}`);
      notifications.show({
        color: "red",
        title: t("Updater.CheckFailed", "Could not check for updates"),
        message: String(error),
      });
    }
  }, [closeUpdate, manualUpdate, t]);

  const progressValue = progress.total
    ? Math.min(100, (progress.downloaded / progress.total) * 100)
    : 100;
  const progressLabel = progress.total
    ? t("Updater.DownloadProgress", "{{downloaded}} of {{total}}", {
        downloaded: formatBytes(progress.downloaded),
        total: formatBytes(progress.total),
      })
    : progress.downloaded > 0
      ? formatBytes(progress.downloaded)
      : t("Updater.PreparingDownload", "Preparing download…");

  const activeVersion = update?.version ?? manualUpdate?.version ?? "";
  const activeBody = update?.body ?? manualUpdate?.body ?? "";
  const isManual = Boolean(manualUpdate && !update);

  return (
    <Modal
      centered
      size="xl"
      opened={Boolean(update || manualUpdate)}
      onClose={closeUpdate}
      closeOnClickOutside={!installing}
      closeOnEscape={!installing}
      withCloseButton={!installing}
      title={t("Updater.Available", "Onyx Chess Lab {{version}} is available", {
        version: activeVersion,
      })}
    >
      <Stack gap="md">
        <Text size="sm">
          {isManual
            ? t(
                "Updater.ManualConfirmation",
                "A newer version of Onyx Chess Lab is available on GitHub Releases.",
              )
            : t(
                "Updater.Confirmation",
                "Do you want to download and install this Onyx Chess Lab update?",
              )}
        </Text>
        {activeBody && (
          <ScrollArea.Autosize mah="40vh" type="auto">
            <ReleaseNotesView notes={releaseNotesForLanguage(activeBody, i18n.language)} />
          </ScrollArea.Autosize>
        )}
        {!isManual && installing && (
          <Stack gap={4}>
            <Progress
              value={progressValue}
              animated={!progress.finished}
              striped={!progress.finished}
            />
            <Text size="xs" c="dimmed">
              {progressLabel}
            </Text>
          </Stack>
        )}
        <Text size="xs" c="dimmed">
          {isManual
            ? t(
                "Updater.ManualNotice",
                "On macOS and Linux, download the new installer from GitHub Releases to update.",
              )
            : t(
                "Updater.RestartNotice",
                "The installer will close Onyx Chess Lab and reopen it after the update.",
              )}
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={closeUpdate} disabled={installing}>
            {t("Common.Cancel", "Cancel")}
          </Button>
          {isManual ? (
            <Button onClick={() => void openManualDownload()}>
              {t("Updater.DownloadUpdate", "Download update")}
            </Button>
          ) : (
            <Button onClick={() => void installUpdate()} loading={installing}>
              {t("Updater.InstallNow", "Install now")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
