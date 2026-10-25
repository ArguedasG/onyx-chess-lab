import { Alert, Button, Group, Text } from "@mantine/core";
import { IconBrain } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { enginesAtom } from "@/state/atoms";
import type { LocalEngine } from "@/utils/engines";
import { isMaiaEngine } from "@/utils/humanBots";

/** The first installed Maia 3 engine, or `null` when there is none. */
export function useInstalledMaia(): LocalEngine | null {
  const engines = useAtomValue(enginesAtom);
  return (
    (engines ?? []).find(
      (engine): engine is LocalEngine =>
        engine.type === "local" && Boolean(engine.path) && isMaiaEngine(engine),
    ) ?? null
  );
}

/**
 * The same notice everywhere a feature needs Maia 3 and it is not installed, with a direct way to
 * the managed installation in Engines.
 */
export default function MaiaRequiredAlert({
  children,
  color = "yellow",
}: {
  /** What the feature cannot do without Maia; a generic sentence when omitted. */
  children?: ReactNode;
  color?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Alert color={color} icon={<IconBrain size={16} />} py={8}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">
          {children ??
            t(
              "Maia.Required",
              "This needs Maia 3, the engine that plays like a human. It is not installed yet.",
            )}
        </Text>
        <Button
          size="compact-sm"
          variant="light"
          color={color}
          style={{ flexShrink: 0 }}
          onClick={() => void navigate({ to: "/engines" })}
        >
          {t("Maia.Install", "Install Maia 3")}
        </Button>
      </Group>
    </Alert>
  );
}
