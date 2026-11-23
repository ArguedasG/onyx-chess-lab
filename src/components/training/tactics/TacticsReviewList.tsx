import { useTranslation as useTrainingTranslation } from "react-i18next";
import { Button, ScrollArea, Text } from "@mantine/core";
import { IconCheck, IconPlayerPlay } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

/**
 * The puzzles of a set in "Review set", as a virtual list. It owns its virtualizer so that both
 * mount together with the modal: a virtualizer created outside the modal saw no scroll element on
 * the first open (an empty list) and kept listening to a stale one (only the first rows drawn).
 */
export default function TacticsReviewList({
  total,
  titleFor,
  completed,
  onOpen,
}: {
  total: number;
  titleFor: (index: number) => string | undefined;
  completed: ReadonlySet<number>;
  onOpen: (index: number) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });

  return (
    <ScrollArea h={520} viewportRef={viewportRef} type="auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const index = virtualRow.index;
          const done = completed.has(index);
          return (
            <Button
              key={index}
              variant={done ? "light" : "default"}
              color={done ? "teal" : "gray"}
              fullWidth
              justify="space-between"
              leftSection={done ? <IconCheck size={16} /> : <Text>{index + 1}</Text>}
              rightSection={<IconPlayerPlay size={15} />}
              onClick={() => onOpen(index)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: 40,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <Text size="sm" truncate>
                {titleFor(index) ||
                  trainingT("Training.Copy.Puzzlev0.c9ca2375", "Puzzle {{v0}}", {
                    v0: index + 1,
                  })}
                {done ? ` · ${trainingT("Training.CompletedLower", "completed")}` : ""}
              </Text>
            </Button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
