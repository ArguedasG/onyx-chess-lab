import { MantineProvider } from "@mantine/core";
import i18n from "i18next";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/translation/en-US.json";
import type { TacticsLoadedExercise } from "@/utils/tacticsTraining";
import type { TacticsSet } from "@/utils/trainingAreas";
import TacticsSolutionModal from "./TacticsSolutionModal";

vi.mock("@/components/boards/Board", () => ({
  default: () => <div data-testid="solution-board" />,
}));
vi.mock("@/state/atoms", async () => {
  const { atom } = await import("jotai");
  return { enginesAtom: atom([]) };
});

const exercise: TacticsLoadedExercise = {
  id: "exercise-1",
  recordIndex: 0,
  title: "Opening line",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  solutionLines: [["e2e4", "e7e5"]],
  hasVariations: false,
  sourcePgn: "",
};

const set = {
  config: { startingActor: "student" },
} as TacticsSet;

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    resources: { "en-US": en },
    lng: "en-US",
    fallbackLng: "en-US",
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(node: ReactNode) {
  await act(async () => root.render(<MantineProvider>{node}</MantineProvider>));
}

function button(label: string) {
  return [...document.querySelectorAll("button")].find((item) => item.textContent?.includes(label));
}

describe("tactics solution modal", () => {
  it("does not record a failure when confirmation is cancelled", async () => {
    const onClose = vi.fn();
    const onReveal = vi.fn();
    await render(
      <TacticsSolutionModal
        opened
        exercise={exercise}
        set={set}
        onClose={onClose}
        onReveal={onReveal}
      />,
    );
    await act(async () => button("Cancel")?.click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it("records one failure and displays the prepared principal line after confirmation", async () => {
    const onReveal = vi.fn();
    await render(
      <TacticsSolutionModal
        opened
        exercise={exercise}
        set={set}
        onClose={vi.fn()}
        onReveal={onReveal}
      />,
    );
    await act(async () => button("View anyway")?.click());
    expect(onReveal).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("Principal solution");
    expect(document.body.textContent).toContain("e4 e5");
  });

  it("does not record a failure when an engine-only solution cannot be calculated", async () => {
    const onReveal = vi.fn();
    await render(
      <TacticsSolutionModal
        opened
        exercise={{ ...exercise, solutionLines: [] }}
        set={set}
        onClose={vi.fn()}
        onReveal={onReveal}
      />,
    );
    await act(async () => button("View anyway")?.click());
    expect(onReveal).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Set up Stockfish");
  });
});
