import { useTranslation as useTrainingTranslation } from "react-i18next";
import { Badge, Button, Card, Group, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconClock, IconPlayerPlay, IconTrophy } from "@tabler/icons-react";
import { useState } from "react";
import { BASIC_MATES, BASIC_MATE_TIME_OPTIONS } from "@/utils/basicMates";
import type { BasicMateId, BasicMateRecord } from "@/utils/trainingAreas";

const PIECES: Record<BasicMateId, string> = {
  kq: "♔♕ – ♚",
  kr: "♔♖ – ♚",
  kbb: "♔♗♗ – ♚",
  kbn: "♔♗♘ – ♚",
};

export function formatMateTime(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Timed basic mates against a king defended by the tablebase (part of I-52). */
export function BasicMatesPanel({
  records,
  onPlay,
}: {
  records: Partial<Record<BasicMateId, BasicMateRecord>>;
  onPlay: (id: BasicMateId, seconds: number) => void;
}) {
  const { t: trainingT } = useTrainingTranslation();
  const [times, setTimes] = useState<Partial<Record<BasicMateId, number>>>({});
  const titles: Record<BasicMateId, string> = {
    kq: trainingT("Endgames.Mates.KQ", "Queen against king"),
    kr: trainingT("Endgames.Mates.KR", "Rook against king"),
    kbb: trainingT("Endgames.Mates.KBB", "Two bishops against king"),
    kbn: trainingT("Endgames.Mates.KBN", "Bishop and knight against king"),
  };

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {trainingT(
          "Endgames.Mates.Description",
          "A new random position each time. The lone king defends as well as possible and the 50-move rule counts: mate before your clock runs out.",
        )}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {BASIC_MATES.map((mate) => {
          const record = records[mate.id];
          const seconds = times[mate.id] ?? mate.defaultSeconds;
          return (
            <Card key={mate.id} withBorder>
              <Stack h="100%" justify="space-between" gap="sm">
                <div>
                  <Text fz={28} lh={1.2}>
                    {PIECES[mate.id]}
                  </Text>
                  <Title order={4} mt="xs">
                    {titles[mate.id]}
                  </Title>
                  <Group gap="xs" mt="xs">
                    {record?.bestTimeMs !== null && record?.bestTimeMs !== undefined ? (
                      <Badge color="teal" variant="light" leftSection={<IconTrophy size={12} />}>
                        {trainingT("Endgames.Mates.Best", "Best {{time}}", {
                          time: formatMateTime(record.bestTimeMs),
                        })}
                      </Badge>
                    ) : (
                      <Badge color="gray" variant="light">
                        {trainingT("Endgames.Mates.NoBest", "No mate yet")}
                      </Badge>
                    )}
                    {record && record.attempts > 0 && (
                      <Text size="xs" c="dimmed">
                        {trainingT("Endgames.Mates.Record", "{{successes}}/{{attempts}} mates", {
                          successes: record.successes,
                          attempts: record.attempts,
                        })}
                      </Text>
                    )}
                  </Group>
                </div>
                <Group gap="xs" wrap="nowrap">
                  <Select
                    size="sm"
                    w={110}
                    leftSection={<IconClock size={14} />}
                    allowDeselect={false}
                    value={String(seconds)}
                    data={BASIC_MATE_TIME_OPTIONS.map((value) => ({
                      value: String(value),
                      label: formatMateTime(value * 1000),
                    }))}
                    onChange={(value) =>
                      value && setTimes((current) => ({ ...current, [mate.id]: Number(value) }))
                    }
                    aria-label={trainingT("Endgames.Mates.Clock", "Clock")}
                  />
                  <Button
                    flex={1}
                    color="teal"
                    leftSection={<IconPlayerPlay size={16} />}
                    onClick={() => onPlay(mate.id, seconds)}
                  >
                    {trainingT("Endgames.Quiz.Play", "Play")}
                  </Button>
                </Group>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
