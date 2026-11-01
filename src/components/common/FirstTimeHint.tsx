import { Button, Group, Popover, type PopoverProps, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconBulb, IconKeyboard } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { dismissHintAtom, type HintId, hintReady, seenHintsAtom } from "@/state/hints";

/**
 * A small card next to a control, shown the first time it matters (`when`), until dismissed.
 * Hints come one at a time, in `HINT_ORDER`; "Show the hints again" in Settings resets them.
 */
export default function FirstTimeHint({
  id,
  when = true,
  title,
  children,
  shortcutsLink = false,
  target,
  ...props
}: {
  id: HintId;
  when?: boolean;
  title: string;
  children: ReactNode;
  /** Adds a button to the keyboard shortcuts in Settings. */
  shortcutsLink?: boolean;
  target: ReactNode;
} & Omit<PopoverProps, "opened" | "children">) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const seen = useAtomValue(seenHintsAtom);
  const dismiss = useSetAtom(dismissHintAtom);
  const opened = when && hintReady(seen, id);

  return (
    <Popover
      opened={opened}
      position="top"
      withArrow
      shadow="md"
      radius="md"
      width={320}
      zIndex={150}
      // Playing on the board must not hide it before it is read: only its buttons and Escape.
      closeOnClickOutside={false}
      onDismiss={() => dismiss(id)}
      {...props}
    >
      <Popover.Target>
        <div>{target}</div>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="xs">
          <Group gap="xs" wrap="nowrap">
            <ThemeIcon size="sm" radius="xl" variant="light">
              <IconBulb size={14} />
            </ThemeIcon>
            <Text size="sm" fw={700}>
              {title}
            </Text>
          </Group>
          <Text size="sm" c="dimmed" component="div">
            {children}
          </Text>
          <Group justify="flex-end" gap="xs" mt={4}>
            {shortcutsLink && (
              <Button
                size="compact-sm"
                variant="subtle"
                leftSection={<IconKeyboard size={14} />}
                onClick={() => {
                  dismiss(id);
                  void navigate({ to: "/settings", search: { section: "keybinds" } });
                }}
              >
                {t("Hints.Shortcuts", "Change shortcuts")}
              </Button>
            )}
            <Button size="compact-sm" onClick={() => dismiss(id)}>
              {t("Hints.GotIt", "Got it")}
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
