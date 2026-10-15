import { Typography } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChess } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { memo, type ReactNode, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import {
  findGameLinkInComment,
  type GameLink,
  type GameLinkIdentity,
  gameLinkFor,
  gameLinkIdentity,
  loadLinkedGame,
  matchesGameIdentity,
  parseGameLink,
  replaceGameLink,
} from "@/utils/gameLinks";
import { createTab } from "@/utils/tabs";
import { getNodeAtPath } from "@/utils/treeReducer";
import GameLinkRestoreModal, { type RestoreChoice } from "./GameLinkRestoreModal";
import { TreeStateContext } from "./TreeStateContext";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
};

const UNDERLINE_LINK = "#onyx-underline";

function underlineNodes(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  const pattern = /\+\+([^+\n](?:[^\n]*?[^+\n])?)\+\+/g;
  let start = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > start) nodes.push({ type: "text", value: value.slice(start, index) });
    nodes.push({
      type: "link",
      url: UNDERLINE_LINK,
      children: [{ type: "text", value: match[1] }],
    });
    start = index + match[0].length;
  }

  if (start < value.length) nodes.push({ type: "text", value: value.slice(start) });
  return nodes.length > 0 ? nodes : [{ type: "text", value }];
}

function remarkUnderline() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children || ["code", "inlineCode", "link", "html"].includes(node.type)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === "text" && child.value?.includes("++")) {
          return underlineNodes(child.value);
        }
        visit(child);
        return child;
      });
    };
    visit(tree);
  };
}

function safeCommentLink(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const parsed = new URL(href);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? href : undefined;
  } catch {
    return undefined;
  }
}

type RestoreState = {
  reason: "missing" | "changed";
  identity: GameLinkIdentity | null;
  fen: string;
};

/**
 * A link to a database game: opens it in a new analysis tab at the linked move. When the game is
 * gone or the id now holds another game, and the comment belongs to a move of the open tree, it
 * offers to restore the link instead.
 */
function GameLinkAnchor({
  link,
  comment,
  path,
  children,
}: {
  link: GameLink;
  comment: string;
  path?: number[];
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const activeTab = useAtomValue(activeTabAtom);
  const navigate = useNavigate();
  const store = useContext(TreeStateContext);
  const [restore, setRestore] = useState<RestoreState | null>(null);

  const identity = () => gameLinkIdentity(link, findGameLinkInComment(comment, link)?.label ?? "");

  /** Opens the restore dialog; returns false when the comment cannot be edited from here. */
  function offerRestore(reason: RestoreState["reason"]) {
    if (!store || !path) return false;
    const node = getNodeAtPath(store.getState().root, path);
    if (!node) return false;
    setRestore({ reason, identity: identity(), fen: node.fen });
    return true;
  }

  function restoreLink({ file, candidate }: RestoreChoice) {
    if (!store || !path) return;
    const state = store.getState();
    const node = getNodeAtPath(state.root, path);
    const next = node
      ? replaceGameLink(node.comment, link, gameLinkFor(candidate, file, candidate.ply), candidate)
      : undefined;
    setRestore(null);
    if (!node || next === undefined || next === node.comment) {
      notifications.show({ color: "red", message: t("GameLink.Restore.Failed") });
      return;
    }
    state.setCommentAt(path, next);
    notifications.show({ color: "green", message: t("GameLink.Restore.Done") });
  }

  async function open() {
    let loaded: Awaited<ReturnType<typeof loadLinkedGame>>;
    try {
      loaded = await loadLinkedGame(link);
    } catch {
      if (!offerRestore("missing")) {
        notifications.show({
          color: "red",
          message: t("GameLink.NotFound", { database: link.database }),
        });
      }
      return;
    }
    const { database, game } = loaded;
    const expected = identity();
    if (expected && !matchesGameIdentity(expected, game) && offerRestore("changed")) return;
    try {
      await createTab({
        tab: {
          name: `${game.white} - ${game.black}`,
          type: "analysis",
          returnTabId: activeTab ?? undefined,
        },
        setTabs,
        setActiveTab,
        pgn: game.moves,
        headers: game,
        position: Array(link.ply).fill(0),
        gameOrigin: { kind: "database", database, gameId: game.id },
      });
      navigate({ to: "/" });
    } catch {
      notifications.show({
        color: "red",
        message: t("GameLink.NotFound", { database: link.database }),
      });
    }
  }

  return (
    <>
      {restore && (
        <GameLinkRestoreModal
          opened
          onClose={() => setRestore(null)}
          databaseName={link.database}
          identity={restore.identity}
          fen={restore.fen}
          preferredPly={link.ply}
          reason={restore.reason}
          onRestore={restoreLink}
        />
      )}
      <a
        href="#"
        title={t("GameLink.Open")}
        style={{ whiteSpace: "nowrap" }}
        onClick={(event) => {
          // The comment sits inside a move cell; the click must not also select that move.
          event.preventDefault();
          event.stopPropagation();
          void open();
        }}
      >
        <IconChess size="0.9em" style={{ verticalAlign: "-0.1em", marginRight: 2 }} />
        {children}
      </a>
    </>
  );
}

const urlTransform = (url: string) => (parseGameLink(url) ? url : defaultUrlTransform(url));

/** `path` is the move the comment belongs to; with it, broken game links can be restored. */
function Comment({ comment, path }: { comment: string; path?: number[] }) {
  const multipleLine = comment.split("\n").filter((v) => v.trim() !== "").length > 1;

  return (
    <Typography
      pl={0}
      mx={4}
      style={{
        display: multipleLine ? "block" : "inline",
      }}
    >
      <Markdown
        components={{
          a: ({ node: _node, href, children, ...props }) => {
            const gameLink = parseGameLink(href);
            if (gameLink) {
              return (
                <GameLinkAnchor link={gameLink} comment={comment} path={path}>
                  {children}
                </GameLinkAnchor>
              );
            }
            return href === UNDERLINE_LINK ? (
              <u>{children}</u>
            ) : (
              <a {...props} href={safeCommentLink(href)} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          p: ({ node: _node, ...props }) => (multipleLine ? <p {...props} /> : <span {...props} />),
        }}
        remarkPlugins={[remarkGfm, remarkUnderline]}
        urlTransform={urlTransform}
        skipHtml
      >
        {comment}
      </Markdown>
    </Typography>
  );
}

export default memo(Comment);
