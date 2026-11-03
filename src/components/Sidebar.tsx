"use no memo";
import {
  AppShellSection,
  Divider,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  type Icon,
  IconChess,
  IconCpu,
  IconDatabase,
  IconFileImport,
  IconFiles,
  IconFlask,
  IconHome,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlayerPlay,
  IconSettings,
  IconTarget,
  IconTrophy,
  IconBook,
  IconNotebook,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react";
import { Link, useLocation, useMatchRoute } from "@tanstack/react-router";
import cx from "clsx";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useBoardShellActions } from "@/hooks/useBoardShellActions";
import { activeTabAtom, lastBoardTabAtom, sidebarExpandedAtom, tabsAtom } from "@/state/atoms";
import { isBoardTab } from "@/utils/tabs";
import classes from "./Sidebar.module.css";

interface NavbarLinkProps {
  icon: Icon;
  label: string;
  url: string;
  expanded: boolean;
}

function NavContent({ icon: Icon, label, expanded }: Omit<NavbarLinkProps, "url">) {
  return (
    <>
      <Icon size="1.35rem" stroke={1.5} className={classes.icon} />
      {expanded && (
        <Text size="sm" truncate>
          {label}
        </Text>
      )}
    </>
  );
}

function NavbarLink({ url, icon, label, expanded }: NavbarLinkProps) {
  const match = useMatchRoute();
  return (
    <Tooltip label={label} position="right" disabled={expanded}>
      <Link
        to={url}
        aria-label={label}
        className={cx(classes.link, {
          [classes.active]: match({ to: url, fuzzy: url !== "/" }) !== false,
          [classes.expanded]: expanded,
        })}
      >
        <NavContent icon={icon} label={label} expanded={expanded} />
      </Link>
    </Tooltip>
  );
}

function NavbarAction({
  icon,
  label,
  expanded,
  active = false,
  onClick,
}: {
  icon: Icon;
  label: string;
  expanded: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} position="right" disabled={expanded}>
      <UnstyledButton
        type="button"
        aria-label={label}
        className={cx(classes.link, classes.action, {
          [classes.active]: active,
          [classes.expanded]: expanded,
        })}
        onClick={onClick}
      >
        <NavContent icon={icon} label={label} expanded={expanded} />
      </UnstyledButton>
    </Tooltip>
  );
}

export function SideBar() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useAtom(sidebarExpandedAtom);
  const { openHome, openBoard, startGame, importGame, openLaboratory } = useBoardShellActions();
  const tabs = useAtomValue(tabsAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const setLastBoardTab = useSetAtom(lastBoardTabAtom);
  const pathname = useLocation({ select: (location) => location.pathname });
  const current = tabs.find((tab) => tab.value === activeTab);
  // Home, board, game and generator all live on "/": the active tab says which one is shown.
  const shown = pathname === "/" ? current?.type : undefined;

  useEffect(() => {
    if (isBoardTab(current)) setLastBoardTab(current!.value);
  }, [current, setLastBoardTab]);

  return (
    <>
      {/* Scrolls when the window is short or the font large, so no section is out of reach;
          Settings and the collapse button below always stay visible. */}
      <AppShellSection grow component={ScrollArea} type="auto" scrollbarSize={4} mih={0}>
        <Stack gap={2} py="xs">
          <NavbarAction
            icon={IconHome}
            label={t("SideBar.Home", "Home")}
            expanded={expanded}
            active={shown === "new"}
            onClick={() => void openHome()}
          />
          <NavbarAction
            icon={IconChess}
            label={t("SideBar.Board", "Board")}
            expanded={expanded}
            active={shown === "analysis" || shown === "puzzles"}
            onClick={() => void openBoard()}
          />
          <NavbarAction
            icon={IconPlayerPlay}
            label={t("SideBar.Play", "Play")}
            expanded={expanded}
            active={shown === "play"}
            onClick={() => void startGame()}
          />
          <NavbarLink
            icon={IconTrophy}
            label={t("SideBar.Tournaments", "Tournaments")}
            url="/tournaments"
            expanded={expanded}
          />
          <NavbarAction
            icon={IconFileImport}
            label={t("SideBar.Import", "Import")}
            expanded={expanded}
            onClick={() => void importGame()}
          />
          <NavbarLink
            icon={IconTarget}
            label={t("SideBar.Training", "Training")}
            url="/training"
            expanded={expanded}
          />
          <NavbarLink
            icon={IconNotebook}
            label={t("SideBar.Studies", "Studies")}
            url="/studies"
            expanded={expanded}
          />
          <NavbarLink
            icon={IconBook}
            label={t("SideBar.Books", "Books")}
            url="/books"
            expanded={expanded}
          />
          <NavbarLink
            icon={IconUsersGroup}
            label={t("SideBar.Players", "Players")}
            url="/players"
            expanded={expanded}
          />
          <Divider my={4} />
          <NavbarLink
            icon={IconFiles}
            label={t("SideBar.Files", "Files")}
            url="/files"
            expanded={expanded}
          />
          <NavbarLink
            icon={IconDatabase}
            label={t("SideBar.Databases", "Databases")}
            url="/databases"
            expanded={expanded}
          />
          <NavbarLink
            icon={IconCpu}
            label={t("SideBar.Engines", "Engines")}
            url="/engines"
            expanded={expanded}
          />
          <NavbarLink
            icon={IconUser}
            label={t("SideBar.User", "Accounts")}
            url="/accounts"
            expanded={expanded}
          />
          <Divider my={4} />
          <NavbarAction
            icon={IconFlask}
            label={t("SideBar.Laboratory", "Model Game Generator")}
            expanded={expanded}
            active={shown === "generator"}
            onClick={() => void openLaboratory()}
          />
        </Stack>
      </AppShellSection>
      <AppShellSection>
        <Stack gap={2} pb="xs">
          <NavbarLink
            icon={IconSettings}
            label={t("SideBar.Settings")}
            url="/settings"
            expanded={expanded}
          />
          <NavbarAction
            icon={expanded ? IconLayoutSidebarLeftCollapse : IconLayoutSidebarLeftExpand}
            label={t(expanded ? "SideBar.Collapse" : "SideBar.Expand")}
            expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          />
        </Stack>
      </AppShellSection>
    </>
  );
}
