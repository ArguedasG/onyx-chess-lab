import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconPencil } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { OpeningVariant } from "@/utils/trainingAreas";

export type ReferenceGroup = { name: string; variants: OpeningVariant[] };

/** Informative variants by the section they were imported in, in repertoire order. */
export function groupReferenceVariants(variants: readonly OpeningVariant[]): ReferenceGroup[] {
  const groups = new Map<string, OpeningVariant[]>();
  for (const variant of variants) {
    if (variant.contentType !== "reference") continue;
    const name = variant.group ?? variant.name;
    groups.set(name, [...(groups.get(name) ?? []), variant]);
  }
  return [...groups.entries()].map(([name, grouped]) => ({ name, variants: grouped }));
}

/**
 * Informative sections of a repertoire (strategy, endgames, exercises…): material to look at and
 * analyze, like the model games, that never enters training. Each record opens on the board.
 */
export default function ReferenceSections({
  groups,
  onOpen,
  onEdit,
}: {
  groups: ReferenceGroup[];
  onOpen: (variantId: string) => void;
  onEdit: (variant: OpeningVariant) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap="sm">
      <Title order={4}>{t("Repertoire.Reference", "Informative")}</Title>
      <Text size="sm" c="dimmed">
        {t(
          "Repertoire.ReferenceHint",
          "Strategy, endgames, exercises and other material to look at and analyze. It never enters memorization practice.",
        )}
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {groups.map((group) => (
          <Card key={group.name} withBorder>
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} lineClamp={1}>
                  {group.name}
                </Text>
                <Badge color="cyan" variant="light">
                  {group.variants.length}
                </Badge>
              </Group>
              <ScrollArea.Autosize mah={220} offsetScrollbars>
                <Stack gap={4}>
                  {group.variants.map((variant) => (
                    <Group key={variant.id} justify="space-between" wrap="nowrap" gap="xs">
                      <Text size="sm" lineClamp={1} style={{ minWidth: 0 }}>
                        {variant.name}
                      </Text>
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-xs"
                          variant="light"
                          onClick={() => onOpen(variant.id)}
                        >
                          {t("Repertoire.AnalyzeModel", "Open and analyze")}
                        </Button>
                        <Tooltip label={t("Common.Edit", "Edit")}>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            onClick={() => onEdit(variant)}
                          >
                            <IconPencil size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
