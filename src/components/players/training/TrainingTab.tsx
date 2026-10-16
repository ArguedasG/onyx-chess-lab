import { Center, Loader, NavLink, Paper, ScrollArea, Stack, Text, Group } from "@mantine/core";
import { IconDroplet, IconListCheck, IconPlaylistAdd, IconShieldHalf } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMistakeQueues } from "@/state/mistakeQueue";
import {
  addMistakes,
  type MistakeFilter,
  type MistakeItem,
  ownerQueue,
  withOwnerQueue,
} from "@/utils/mistakes/queue";
import type { PlayerAnalysisCriticalPosition, PlayerEngineAnalysis } from "@/utils/playerAnalysis";
import type { ProfileGame } from "@/utils/players/profileGames";
import DiagnosisSection from "./DiagnosisSection";
import LeaksSection from "./LeaksSection";
import MistakeQueueSection from "./MistakeQueueSection";
import PracticeSection from "./PracticeSection";

type Section = "queue" | "diagnosis" | "practice" | "leaks";

const sectionAtom = atomWithStorage<Section>("player-training-section", "queue");

/** Errors of the engine analysis among the games of the card filters. */
export function filteredCriticals(
  engine: PlayerEngineAnalysis | null,
  games: readonly ProfileGame[],
): PlayerAnalysisCriticalPosition[] {
  if (!engine) return [];
  const keys = new Set(games.map((game) => game.key));
  return engine.games
    .filter((game) => keys.has(game.key))
    .flatMap((game) => game.criticalPositions);
}

/**
 * Adds the errors of a new engine analysis to the owner's queue when the automatic addition is on
 * (I-17). Each analysis is added once, recorded by its date.
 */
export function useAutoMistakes(
  owner: string | null,
  profileId: string,
  engine: PlayerEngineAnalysis | null,
) {
  const { queues, update } = useMistakeQueues();
  const queue = owner && queues ? ownerQueue(queues, owner) : null;
  const analyzedAt = engine?.analyzedAt;
  useEffect(() => {
    if (!owner || !queue?.autoAdd || !engine || !analyzedAt) return;
    if (queue.synced[profileId] === analyzedAt) return;
    update((current) =>
      withOwnerQueue(current, owner, (stored) => ({
        ...addMistakes(stored, engine.criticalPositions).queue,
        synced: { ...stored.synced, [profileId]: analyzedAt },
      })),
    );
  }, [analyzedAt, engine, owner, profileId, queue?.autoAdd, queue?.synced, update]);
}

/**
 * Training tab of a player card (8.7): My mistakes, training priorities, conversion and defense
 * practice and the catalogue of leaks.
 */
export default function TrainingTab({
  owner,
  name,
  isSelf,
  games,
  engine,
  onOpenGameAt,
  onShowOpenings,
}: {
  owner: string;
  name: string;
  isSelf: boolean;
  games: ProfileGame[];
  engine: PlayerEngineAnalysis | null;
  onOpenGameAt: (databasePath: string, gameId: number, ply: number | null) => void;
  onShowOpenings: () => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useAtom(sectionAtom);
  const [queueFilter, setQueueFilter] = useState<{ filter: MistakeFilter; version: number }>({
    filter: {},
    version: 0,
  });
  const [practice, setPractice] = useState<{ kind: "conversion" | "defense"; version: number }>({
    kind: "conversion",
    version: 0,
  });
  const { queues, update } = useMistakeQueues();
  const queue = queues ? ownerQueue(queues, owner) : null;
  const criticals = useMemo(() => filteredCriticals(engine, games), [engine, games]);

  const reviewQueue = (filter: MistakeFilter) => {
    setQueueFilter((previous) => ({ filter, version: previous.version + 1 }));
    setSection("queue");
  };
  const openSource = (item: MistakeItem) => {
    const source = item.sources.at(-1) ?? item.sources[0];
    if (source) onOpenGameAt(source.databasePath, source.gameId, source.ply);
  };

  const sections: Array<{ value: Section; label: string; icon: React.ReactNode }> = [
    {
      value: "queue",
      label: isSelf ? t("Mistakes.Title", "My mistakes") : t("Mistakes.Nav", "Mistakes"),
      icon: <IconPlaylistAdd size={16} />,
    },
    {
      value: "diagnosis",
      label: t("Diagnosis.Nav", "Priorities"),
      icon: <IconListCheck size={16} />,
    },
    {
      value: "practice",
      label: t("Practice.Nav", "Conversion and defense"),
      icon: <IconShieldHalf size={16} />,
    },
    { value: "leaks", label: t("Leaks.Title", "Leaks"), icon: <IconDroplet size={16} /> },
  ];

  return (
    <Group align="stretch" gap="md" wrap="nowrap" h="100%" style={{ minHeight: 0 }}>
      <Paper withBorder radius="md" p="xs" w={240} style={{ flexShrink: 0 }}>
        <Stack gap={4}>
          {sections.map((item) => (
            <NavLink
              key={item.value}
              active={section === item.value}
              label={item.label}
              leftSection={item.icon}
              onClick={() => setSection(item.value)}
              style={{ borderRadius: 8 }}
            />
          ))}
        </Stack>
      </Paper>
      <ScrollArea style={{ flex: 1, minWidth: 0 }} offsetScrollbars>
        {section === "queue" ? (
          !queue ? (
            <Center h={200}>
              <Stack align="center" gap="xs">
                <Loader />
                <Text size="sm" c="dimmed">
                  {t("Mistakes.Loading", "Reading the queue…")}
                </Text>
              </Stack>
            </Center>
          ) : (
            <MistakeQueueSection
              key={queueFilter.version}
              queue={queue}
              onChange={(change) => update((current) => withOwnerQueue(current, owner, change))}
              criticals={criticals}
              name={name}
              isSelf={isSelf}
              initialFilter={queueFilter.filter}
              onOpenSource={openSource}
            />
          )
        ) : section === "diagnosis" ? (
          <DiagnosisSection
            games={games}
            engine={engine}
            actions={{
              reviewQueue,
              practice: (kind) => {
                setPractice((previous) => ({ kind, version: previous.version + 1 }));
                setSection("practice");
              },
              showLeaks: () => setSection("leaks"),
              showOpenings: onShowOpenings,
            }}
          />
        ) : section === "practice" ? (
          <PracticeSection
            key={practice.version}
            initialKind={practice.kind}
            engine={engine}
            games={games}
            onOpenGame={(game, ply) => onOpenGameAt(game.source.databasePath, game.id, ply)}
          />
        ) : (
          <LeaksSection
            engine={engine}
            games={games}
            onReviewCategory={(category) => reviewQueue({ category })}
            onOpenExample={(critical) =>
              onOpenGameAt(critical.databasePath, critical.gameId, critical.ply)
            }
          />
        )}
      </ScrollArea>
    </Group>
  );
}
