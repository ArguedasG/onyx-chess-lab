import { Typography } from "@mantine/core";
import { memo } from "react";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

function Comment({ comment }: { comment: string }) {
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
          a: ({ node: _node, href, children, ...props }) =>
            href === UNDERLINE_LINK ? (
              <u>{children}</u>
            ) : (
              <a {...props} href={safeCommentLink(href)} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          p: ({ node: _node, ...props }) => (multipleLine ? <p {...props} /> : <span {...props} />),
        }}
        remarkPlugins={[remarkGfm, remarkUnderline]}
        skipHtml
      >
        {comment}
      </Markdown>
    </Typography>
  );
}

export default memo(Comment);
