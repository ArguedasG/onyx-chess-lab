import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Comment from "./Comment";

describe("Comment", () => {
  const renderComment = (comment: string) =>
    renderToStaticMarkup(
      <MantineProvider>
        <Comment comment={comment} />
      </MantineProvider>,
    );

  it("renders supported markdown and underline markup without raw HTML", () => {
    const html = renderComment('**safe** ++underlined++ <img src=x onerror="alert(1)">');

    expect(html).toContain("<strong>safe</strong>");
    expect(html).toContain("<u>underlined</u>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
  });

  it("drops unsafe and relative link destinations", () => {
    const html = renderComment(
      "[web](https://lichess.org) [unsafe](javascript:alert(1)) [local](/admin)",
    );

    expect(html).toContain('href="https://lichess.org"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('href="/admin"');
  });
});
