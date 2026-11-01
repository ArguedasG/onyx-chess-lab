import { Group, Kbd, Text, Tooltip, type TooltipProps } from "@mantine/core";
import { platform } from "@tauri-apps/plugin-os";
import { Fragment } from "react";
import { shortcutKeys } from "@/utils/shortcuts";

const isMac = (() => {
  try {
    return platform() === "macos";
  } catch {
    return false;
  }
})();

/** The keys of a shortcut as small keyboard caps. */
export function ShortcutKeys({ keys, size = "xs" }: { keys: string; size?: "xs" | "sm" }) {
  const combos = shortcutKeys(keys, isMac);
  return (
    <Group gap={4} wrap="nowrap" component="span">
      {combos.map((combo, index) => (
        <Fragment key={combo.join("+")}>
          {index > 0 && (
            <Text span size="xs" c="dimmed">
              /
            </Text>
          )}
          {combo.map((key, keyIndex) => (
            <Kbd key={`${key}-${keyIndex}`} size={size}>
              {key}
            </Kbd>
          ))}
        </Fragment>
      ))}
    </Group>
  );
}

/** A tooltip that says what a control does and, when it has one, its keyboard shortcut. */
export default function ShortcutTooltip({
  label,
  keys,
  children,
  ...props
}: { label: string; keys?: string } & Omit<TooltipProps, "label">) {
  return (
    <Tooltip
      openDelay={300}
      {...props}
      label={
        <Group gap="xs" wrap="nowrap">
          <Text size="xs">{label}</Text>
          {keys && <ShortcutKeys keys={keys} />}
        </Group>
      }
    >
      {children}
    </Tooltip>
  );
}
