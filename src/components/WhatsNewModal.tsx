import { Button, Group, List, ScrollArea, Stack, Text, Title } from "@mantine/core";
import { Modal } from "@/components/common/Modal";
import { getVersion } from "@tauri-apps/api/app";
import { warn } from "@tauri-apps/plugin-log";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  APP_WHATS_NEW_EVENT,
  CHANGELOG,
  type ChangelogEntry,
  compareVersions,
  notesForLanguage,
  type ReleaseNotes,
  unseenEntries,
} from "@/utils/changelog";
import { browserStorage, isLanguageChoicePending } from "@/utils/language";

/** Version whose notes the user has already been shown. */
const LAST_SEEN_VERSION_KEY = "last-seen-version";

function readLastSeenVersion() {
  try {
    return browserStorage()?.getItem(LAST_SEEN_VERSION_KEY) ?? null;
  } catch {
    return null;
  }
}

function storeLastSeenVersion(version: string) {
  try {
    browserStorage()?.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    // The notes will simply be shown again on the next launch.
  }
}

/** One version's notes; the updater uses it too for the version it offers. */
export function ReleaseNotesView({ notes }: { notes: ReleaseNotes }) {
  return (
    <Stack gap="xs">
      {notes.summary && <Text size="sm">{notes.summary}</Text>}
      {notes.sections.map((section, index) => (
        <Stack gap={4} key={`${section.title}-${index}`}>
          {section.title && (
            <Text size="sm" fw={600}>
              {section.title}
            </Text>
          )}
          <List size="sm" spacing={2}>
            {section.items.map((item) => (
              <List.Item key={item}>{item}</List.Item>
            ))}
          </List>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Shows what changed after an update, once, and the whole history from Help → What's new. The notes
 * ship with the app (`src/data/changelog.json`), so they need no connection.
 */
export default function WhatsNewModal() {
  const { t, i18n } = useTranslation();
  // A first launch asks for the language first; it has no earlier version to compare with.
  const [isNewInstall] = useState(() => isLanguageChoicePending(browserStorage()));
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((version) => {
        if (cancelled) return;
        setCurrentVersion(version);
        const unseen = unseenEntries(CHANGELOG, version, readLastSeenVersion(), isNewInstall);
        if (unseen.length > 0) {
          setEntries(unseen);
          setOpened(true);
        } else {
          storeLastSeenVersion(version);
        }
      })
      .catch((error) => warn(`Could not read the app version: ${String(error)}`));
    return () => {
      cancelled = true;
    };
  }, [isNewInstall]);

  useEffect(() => {
    const showHistory = () => {
      setEntries(
        CHANGELOG.filter(
          (entry) => !currentVersion || compareVersions(entry.version, currentVersion) <= 0,
        ),
      );
      setOpened(true);
    };
    window.addEventListener(APP_WHATS_NEW_EVENT, showHistory);
    return () => window.removeEventListener(APP_WHATS_NEW_EVENT, showHistory);
  }, [currentVersion]);

  const close = useCallback(() => {
    setOpened(false);
    if (currentVersion) storeLastSeenVersion(currentVersion);
  }, [currentVersion]);

  return (
    <Modal
      centered
      size="lg"
      opened={opened && entries.length > 0}
      onClose={close}
      title={t("WhatsNew.Title", "What's new in Onyx Chess Lab")}
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="lg">
        {entries.map((entry) => (
          <Stack gap="xs" key={entry.version}>
            <Title order={5}>
              {t("WhatsNew.Version", "Version {{version}}", { version: entry.version })}
            </Title>
            <ReleaseNotesView notes={notesForLanguage(entry, i18n.language)} />
          </Stack>
        ))}
        <Group justify="flex-end">
          <Button onClick={close}>{t("WhatsNew.Close", "Got it")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
