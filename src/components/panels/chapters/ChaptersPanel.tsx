import { ActionIcon, Group, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { use, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { useStore } from "zustand";
import { commands } from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import GameSelector from "@/components/panels/info/GameSelector";
import ConfirmChangesModal from "@/components/tabs/ConfirmChangesModal";
import { currentTabAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybinds";
import { parsePGN } from "@/utils/chess";
import { loadStudyLibrary, type StudyChapter } from "@/utils/studies";
import { getTabFile, getTabGameNumber, type Tab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import classes from "./ChaptersPanel.module.css";

/** Whether the tab has siblings to move between: study chapters or games of a multi-game PGN. */
export function hasChapters(tab: Tab | null | undefined) {
  if (!tab) return false;
  if (tab.gameOrigin.kind === "study") return true;
  return (getTabFile(tab)?.numGames ?? 0) > 1;
}

/**
 * Chapters of the study, or games of the PGN file, this board came from — always in reach,
 * like a book's table of contents. Unsaved changes are confirmed before switching.
 */
export default function ChaptersPanel() {
  const currentTab = useAtomValue(currentTabAtom);
  if (currentTab?.gameOrigin.kind === "study") {
    return (
      <StudyChapters
        studyId={currentTab.gameOrigin.studyId}
        chapterId={currentTab.gameOrigin.chapterId}
      />
    );
  }
  if (getTabFile(currentTab)) return <FileGames />;
  return null;
}

/** Asks before leaving a dirty game, then runs the switch. */
function useGuardedSwitch<T>(run: (target: T) => Promise<void>) {
  const store = use(TreeStateContext)!;
  const dirty = useStore(store, (state) => state.dirty);
  const [confirming, toggleConfirming] = useToggle();
  const pending = useRef<T | null>(null);
  const request = (target: T) => {
    if (dirty) {
      pending.current = target;
      toggleConfirming();
    } else {
      void run(target);
    }
  };
  const confirmed = () => {
    if (pending.current !== null) void run(pending.current);
  };
  return { request, confirming, toggleConfirming, confirmed };
}

function Header({
  title,
  position,
  count,
  onPrevious,
  onNext,
}: {
  title: string;
  position: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Group justify="space-between" wrap="nowrap" className={classes.header}>
      <div style={{ minWidth: 0 }}>
        <Text fw={700} size="sm" truncate>
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {t("Chapters.Position", "{{position}} of {{count}}", { position, count })}
        </Text>
      </div>
      <Group gap={4} wrap="nowrap">
        <Tooltip label={t("Chapters.Previous", "Previous")}>
          <ActionIcon variant="default" disabled={position <= 1} onClick={onPrevious}>
            <IconChevronLeft size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Chapters.Next", "Next")}>
          <ActionIcon variant="default" disabled={position >= count} onClick={onNext}>
            <IconChevronRight size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

function StudyChapters({ studyId, chapterId }: { studyId: string; chapterId: string }) {
  const { t } = useTranslation();
  const store = use(TreeStateContext)!;
  const setState = useStore(store, (state) => state.setState);
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const keyMap = useAtomValue(keyMapAtom);
  // Reloaded when the chapter changes, so titles saved meanwhile show up.
  const { data: library } = useSWR(
    ["study-chapters", studyId, chapterId],
    async () => (await loadStudyLibrary()).library,
  );
  const study = library?.studies[studyId];
  const chapters = (study?.chapterOrder ?? [])
    .map((id) => study?.chapters[id])
    .filter((chapter): chapter is StudyChapter => !!chapter);
  const index = chapters.findIndex((chapter) => chapter.id === chapterId);

  const guard = useGuardedSwitch(async (chapter: StudyChapter) => {
    setState(await parsePGN(chapter.pgn));
    setCurrentTab((previous) => ({
      ...previous,
      name: chapter.title,
      gameOrigin: { kind: "study", studyId, chapterId: chapter.id },
    }));
  });
  const go = (offset: number) => {
    const target = chapters[index + offset];
    if (target) guard.request(target);
  };
  useHotkeys(keyMap.NEXT_GAME.keys, () => go(1));
  useHotkeys(keyMap.PREVIOUS_GAME.keys, () => go(-1));

  if (!study) {
    return (
      <Text p="sm" size="sm" c="dimmed">
        {library ? t("Chapters.StudyMissing", "This study no longer exists.") : t("Common.Loading")}
      </Text>
    );
  }
  return (
    <Stack gap={0} h="100%">
      {currentTab && (
        <ConfirmChangesModal
          tab={currentTab}
          opened={guard.confirming}
          toggle={guard.toggleConfirming}
          closeTab={guard.confirmed}
          switching
        />
      )}
      <Header
        title={study.name}
        position={index + 1}
        count={chapters.length}
        onPrevious={() => go(-1)}
        onNext={() => go(1)}
      />
      <ScrollArea flex={1} type="auto">
        <ol className={classes.list}>
          {chapters.map((chapter, position) => (
            <li key={chapter.id}>
              <UnstyledButton
                className={`${classes.item} ${chapter.id === chapterId ? classes.active : ""}`}
                aria-current={chapter.id === chapterId ? "true" : undefined}
                onClick={() => chapter.id !== chapterId && guard.request(chapter)}
              >
                <span className={classes.number}>{position + 1}</span>
                <span className={classes.title}>{chapter.title}</span>
              </UnstyledButton>
            </li>
          ))}
        </ol>
      </ScrollArea>
    </Stack>
  );
}

function FileGames() {
  const { t } = useTranslation();
  const store = use(TreeStateContext)!;
  const setState = useStore(store, (state) => state.setState);
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const keyMap = useAtomValue(keyMapAtom);
  const [games, setGames] = useState<Map<number, string>>(new Map());
  const file = getTabFile(currentTab);
  const gameNumber = getTabGameNumber(currentTab);
  const total = file?.numGames ?? 0;

  useEffect(() => setGames(new Map()), [file?.path]);

  const guard = useGuardedSwitch(async (page: number) => {
    if (!file) return;
    const data = unwrap(await commands.readGames(file.path, page, page));
    setState(await parsePGN(data[0]));
    setCurrentTab((previous) =>
      previous.gameOrigin.kind === "file" || previous.gameOrigin.kind === "temp_file"
        ? { ...previous, gameOrigin: { ...previous.gameOrigin, gameNumber: page } }
        : previous,
    );
  });
  const go = (offset: number) => {
    const target = gameNumber + offset;
    if (target >= 0 && target < total) guard.request(target);
  };
  useHotkeys(keyMap.NEXT_GAME.keys, () => go(1));
  useHotkeys(keyMap.PREVIOUS_GAME.keys, () => go(-1));

  if (!file) return null;
  return (
    <Stack gap={0} h="100%">
      {currentTab && (
        <ConfirmChangesModal
          tab={currentTab}
          opened={guard.confirming}
          toggle={guard.toggleConfirming}
          closeTab={guard.confirmed}
          switching
        />
      )}
      <Header
        title={file.name}
        position={gameNumber + 1}
        count={total}
        onPrevious={() => go(-1)}
        onNext={() => go(1)}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <GameSelector
          games={games}
          setGames={setGames}
          setPage={(page) => page !== gameNumber && guard.request(page)}
          path={file.path}
          activePage={gameNumber}
          total={total}
        />
      </div>
      <Text size="xs" c="dimmed" px="sm" py={4}>
        {t("Chapters.FileHint", "Games of this PGN file. Edit or delete them from the Info tab.")}
      </Text>
    </Stack>
  );
}
