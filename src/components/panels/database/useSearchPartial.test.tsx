import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type SearchPartial, useSearchPartial } from "./useSearchPartial";

type Handler = (event: { payload: unknown }) => void;
const handlers = new Map<string, Handler>();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: Handler) => {
    handlers.set(name, handler);
    return Promise.resolve(() => handlers.delete(name));
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let seen: SearchPartial | null = null;

function Probe({ queryKey, active }: { queryKey: string; active: boolean }) {
  seen = useSearchPartial("board", queryKey, active);
  return null;
}

async function render(queryKey: string, active = true) {
  await act(async () => root.render(<Probe queryKey={queryKey} active={active} />));
}

function emit(name: string, payload: object) {
  act(() => handlers.get(name)?.({ payload }));
}

const opening = (move: string, white: number) => ({ move, white, draw: 0, black: 0, unknown: 0 });

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  seen = null;
});
afterEach(() => {
  act(() => root.unmount());
  handlers.clear();
});

it("shows the running statistics of the tab's search, most played first", async () => {
  await render("e4");
  emit("search_partial", {
    id: "board",
    requestId: 3,
    matches: 30,
    openings: [opening("d5", 10), opening("e5", 20)],
  });
  expect(seen?.matches).toBe(30);
  expect(seen?.openings.map((o) => o.move)).toEqual(["e5", "d5"]);
  // Another tab's search is ignored.
  emit("search_partial", { id: "other", requestId: 9, matches: 1, openings: [] });
  expect(seen?.matches).toBe(30);
});

it("drops a superseded search after the position changes and clears when the search ends", async () => {
  await render("e4");
  emit("search_progress", { id: "board", requestId: 5 });
  await render("d4");
  // A late update of the old request (5) must not show for the new position.
  emit("search_partial", { id: "board", requestId: 5, matches: 99, openings: [] });
  expect(seen).toBeNull();
  emit("search_partial", { id: "board", requestId: 6, matches: 7, openings: [] });
  expect(seen?.matches).toBe(7);
  await render("d4", false);
  expect(seen).toBeNull();
});
