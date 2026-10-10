import { ActionIcon, Portal, Tooltip } from "@mantine/core";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronDown,
  IconSwitchVertical,
} from "@tabler/icons-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clampSplit,
  otherZone,
  swapZones,
  toggleZoneCollapsed,
  toggleZoneMaximized,
  useRightColumnLayout,
  type PanelZone,
  type RightColumnLayoutKey,
} from "@/state/rightColumnLayout";
import classes from "./RightColumn.module.css";

const ZONES: PanelZone[] = ["tools", "notation"];

/** Portal target ids. Only the active board tab is mounted, so they are unique. */
export const panelZoneId = (zone: PanelZone) => `panel-${zone}`;
const panelHeaderId = (zone: PanelZone) => `panel-${zone}-header`;

/**
 * The right side of a board tab: two zones (tools and notation) that can be folded,
 * maximized, swapped and resized. Screens fill them with `<Portal target="#panel-…">`.
 */
export default function RightColumn({ layoutKey }: { layoutKey: RightColumnLayoutKey }) {
  const { t } = useTranslation();
  const [layout, update] = useRightColumnLayout(layoutKey);
  const columnRef = useRef<HTMLDivElement>(null);
  const [dragSplit, setDragSplit] = useState<number | null>(null);
  const split = dragSplit ?? layout.split;

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    const column = columnRef.current;
    if (!column) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const rect = column.getBoundingClientRect();
    let latest = layout.split;
    const move = (moveEvent: PointerEvent) => {
      latest = clampSplit(((moveEvent.clientY - rect.top) / rect.height) * 100);
      setDragSplit(latest);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDragSplit(null);
      update((current) => ({ ...current, split: latest }));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function zoneFlex(zone: PanelZone) {
    if (layout.collapsed === zone) return "0 0 auto";
    if (layout.collapsed) return "1 1 0";
    return `${zone === layout.first ? split : 100 - split} 1 0`;
  }

  return (
    <div ref={columnRef} className={classes.column}>
      {/* DOM order never changes, so portal targets survive a swap; CSS order places them. */}
      {ZONES.map((zone) => {
        const collapsed = layout.collapsed === zone;
        const maximized = layout.collapsed === otherZone(zone);
        const onTop = layout.first === zone;
        return (
          <div
            key={zone}
            className={`${classes.zone} ${collapsed ? classes.collapsed : ""}`}
            style={{ order: onTop ? 0 : 2, flex: zoneFlex(zone) }}
          >
            <div
              className={classes.header}
              onDoubleClick={(event) => {
                // Double-clicking a control (e.g. a tab) must not also resize the zone.
                if ((event.target as HTMLElement).closest("button, input, a, [role='tab']")) return;
                update((current) => toggleZoneMaximized(current, zone));
              }}
            >
              <Tooltip
                label={collapsed ? t("Panels.Expand", "Expand") : t("Panels.Collapse", "Collapse")}
              >
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-expanded={!collapsed}
                  onClick={() => update((current) => toggleZoneCollapsed(current, zone))}
                >
                  <IconChevronDown size={16} className={classes.chevron} />
                </ActionIcon>
              </Tooltip>
              <div
                id={panelHeaderId(zone)}
                className={classes.headerSlot}
                // Choosing something in a folded header (a tab, say) means the user wants to see it.
                onClickCapture={() =>
                  collapsed && update((current) => toggleZoneCollapsed(current, zone))
                }
              />
              <div className={classes.actions}>
                <Tooltip
                  label={onTop ? t("Panels.MoveDown", "Move down") : t("Panels.MoveUp", "Move up")}
                >
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    onClick={() => update(swapZones)}
                  >
                    <IconSwitchVertical size={15} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip
                  label={
                    maximized ? t("Panels.Restore", "Restore") : t("Panels.Maximize", "Maximize")
                  }
                >
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    onClick={() => update((current) => toggleZoneMaximized(current, zone))}
                  >
                    {maximized ? (
                      <IconArrowsMinimize size={15} />
                    ) : (
                      <IconArrowsMaximize size={15} />
                    )}
                  </ActionIcon>
                </Tooltip>
              </div>
            </div>
            <div id={panelZoneId(zone)} className={classes.body} />
          </div>
        );
      })}
      {!layout.collapsed && (
        <div
          className={classes.handle}
          style={{ order: 1 }}
          data-dragging={dragSplit !== null || undefined}
          onPointerDown={startResize}
          onDoubleClick={() => update((current) => ({ ...current, split: 50 }))}
          role="separator"
          aria-orientation="horizontal"
        />
      )}
    </div>
  );
}

/** Puts a title (or any control, like a tab list) into a zone's header. */
export function PanelHeader({ zone, children }: { zone: PanelZone; children: ReactNode }) {
  return <Portal target={`#${panelHeaderId(zone)}`}>{children}</Portal>;
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <div className={classes.title}>{children}</div>;
}
