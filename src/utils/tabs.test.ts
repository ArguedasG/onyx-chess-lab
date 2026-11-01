import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "./tabs";
import {
    boardTabToShow,
    createOrReuseBoardTab,
    createTab,
    isEmptyAnalysisTab,
    startTab,
    tabSchema,
    unusedTabLike,
} from "./tabs";
import { defaultTree } from "./treeReducer";
import { createDebouncedSessionStorage } from "@/state/store/debouncedStorage";
import { commands } from "@/bindings";
import { createTreeStore } from "@/state/store/tree";
import { buildModelGameSourcePgn } from "./modelGame";
import type { TreeState } from "./treeReducer";

function analysisTab(value = "analysis-tab"): Tab {
    return {
        name: "Analysis",
        value,
        type: "analysis",
        gameOrigin: { kind: "none" },
    };
}

describe("board shell tab reuse", () => {
    beforeEach(() => sessionStorage.clear());

    it("persists a study chapter as a first-class analysis origin", () => {
        expect(
            tabSchema.parse({
                ...analysisTab("study-tab"),
                returnPath: "/studies",
                gameOrigin: { kind: "study", studyId: "study-1", chapterId: "chapter-1" },
            }),
        ).toMatchObject({
            returnPath: "/studies",
            gameOrigin: { kind: "study", studyId: "study-1", chapterId: "chapter-1" },
        });
    });

    it("opens the selected repertoire branch in a fresh play tab with its own state and no file origin", async () => {
        const source = createTreeStore();
        source.getState().makeMoves({ payload: ["e4", "e5", "Nf3"] });
        source.getState().goToMove([0]);
        source.getState().makeMoves({ payload: ["c5", "Nf3"] });
        source.getState().goToMove([0, 1]);
        const state = source.getState();
        const selectedFen = state.currentNode().fen;
        const original = JSON.stringify(state);
        const lex = vi.spyOn(commands, "lexPgn").mockResolvedValue({
            status: "ok",
            data: [
                { type: "San", value: "e4" },
                { type: "San", value: "c5" },
                { type: "Outcome", value: "*" },
            ],
        });
        try {
            let tabs: Tab[] = [
                {
                    ...analysisTab("repertoire"),
                    gameOrigin: { kind: "database", database: "repertoire.db3", gameId: 1 },
                },
            ];
            let active: string | null = "repertoire";
            const id = await createTab({
                tab: { name: "New Game", type: "play" },
                pgn: buildModelGameSourcePgn(state.root, state.headers, state.position),
                position: state.position.map(() => 0),
                setTabs: (update) => {
                    tabs = typeof update === "function" ? update(tabs) : update;
                },
                setActiveTab: (update) => {
                    active = typeof update === "function" ? update(active) : update;
                },
            });
            const game: TreeState = JSON.parse(sessionStorage.getItem(id)!).state;
            expect(tabs).toHaveLength(2);
            expect(id).not.toBe("repertoire");
            expect(active).toBe(id);
            expect(tabs[1].gameOrigin.kind).toBe("none");
            expect(game.position).toEqual([0, 0]);
            expect(game.root.children[0].children[0].fen).toBe(selectedFen);
            expect(game.root.children[0].children[0].children).toHaveLength(0);
            expect(JSON.stringify(source.getState())).toBe(original);
            expect(lex.mock.calls[0][0]).toContain("1. e4 c5");
        } finally {
            lex.mockRestore();
        }
    });

    it("only treats analysis tabs without stored state or an origin as empty", () => {
        const tab = analysisTab();
        expect(isEmptyAnalysisTab(tab)).toBe(true);

        sessionStorage.setItem(tab.value, JSON.stringify({ state: { dirty: false } }));
        expect(isEmptyAnalysisTab(tab)).toBe(false);
        expect(
            isEmptyAnalysisTab({
                ...tab,
                gameOrigin: { kind: "database", database: "games.db3", gameId: 1 },
            }),
        ).toBe(false);
    });

    it("does not reuse a tab with an unflushed debounced tree update", async () => {
        const tab = analysisTab("pending-tab");
        const storage = createDebouncedSessionStorage<{ dirty: boolean }>(60_000);
        await storage.setItem(tab.value, { version: 0, state: { dirty: true } });

        expect(isEmptyAnalysisTab(tab)).toBe(false);
        await storage.removeItem(tab.value);
    });

    it("reuses the active empty analysis tab when the preference is enabled", async () => {
        let tabs = [analysisTab()];
        let activeTab: string | null = tabs[0].value;

        const id = await createOrReuseBoardTab({
            tabs,
            activeTab,
            type: "play",
            name: "New Game",
            reuseEmpty: true,
            setTabs: (update) => {
                tabs = typeof update === "function" ? update(tabs) : update;
            },
            setActiveTab: (update) => {
                activeTab = typeof update === "function" ? update(activeTab) : update;
            },
        });

        expect(id).toBe("analysis-tab");
        expect(tabs).toHaveLength(1);
        expect(tabs[0]).toMatchObject({ value: id, type: "play", name: "New Game" });
        expect(activeTab).toBe(id);
    });

    it("creates a new tab when reuse is disabled or the active tab has content", async () => {
        let tabs = [analysisTab()];
        let activeTab: string | null = tabs[0].value;
        sessionStorage.setItem(activeTab, JSON.stringify({ version: 0, state: { dirty: true } }));

        const id = await createOrReuseBoardTab({
            tabs,
            activeTab,
            type: "analysis",
            name: "Analysis",
            reuseEmpty: true,
            setTabs: (update) => {
                tabs = typeof update === "function" ? update(tabs) : update;
            },
            setActiveTab: (update) => {
                activeTab = typeof update === "function" ? update(activeTab) : update;
            },
        });

        expect(id).not.toBe("analysis-tab");
        expect(tabs).toHaveLength(2);
        expect(tabs[0].value).toBe("analysis-tab");
        expect(activeTab).toBe(id);
    });

    it("keeps a sole home tab when evidence explicitly opens beside it", async () => {
        let tabs: Tab[] = [
            { name: "Home", value: "home", type: "new", gameOrigin: { kind: "none" } },
        ];
        let activeTab: string | null = "home";

        const id = await createTab({
            tab: {
                name: "Evidence",
                type: "analysis",
                returnPath: "/accounts",
                returnPlayerAnalysis: { profileId: "profile-second", playerName: "Second" },
            },
            preserveNewTab: true,
            setTabs: (update) => {
                tabs = typeof update === "function" ? update(tabs) : update;
            },
            setActiveTab: (update) => {
                activeTab = typeof update === "function" ? update(activeTab) : update;
            },
        });

        expect(tabs.map((tab) => tab.value)).toEqual(["home", id]);
        expect(tabs[1].returnPath).toBe("/accounts");
        expect(tabs[1].returnPlayerAnalysis).toEqual({
            profileId: "profile-second",
            playerName: "Second",
        });
        expect(activeTab).toBe(id);
    });
});

describe("start screen and the new tab button", () => {
    beforeEach(() => sessionStorage.clear());

    it("opens the home screen or a board, per the setting", () => {
        expect(startTab("home")).toEqual({ name: "Home.Tab", type: "new" });
        expect(startTab("board")).toEqual({
            name: "Home.Card.AnalysisBoard.Title",
            type: "analysis",
        });
    });

    it("treats a board only looked at as unused, and one with any work as used", () => {
        const tab = analysisTab("looked-at");
        sessionStorage.setItem(tab.value, JSON.stringify({ version: 0, state: defaultTree() }));
        expect(isEmptyAnalysisTab(tab)).toBe(true);

        const commented = defaultTree();
        commented.root.comment = "Idea: ...";
        sessionStorage.setItem(tab.value, JSON.stringify({ version: 0, state: commented }));
        expect(isEmptyAnalysisTab(tab)).toBe(false);

        const store = createTreeStore();
        store.getState().makeMoves({ payload: ["e4"] });
        const { root, headers, position, report } = store.getState();
        sessionStorage.setItem(
            tab.value,
            JSON.stringify({
                version: 0,
                state: { root, headers, position, report, dirty: false },
            }),
        );
        expect(isEmptyAnalysisTab(tab)).toBe(false);
    });

    it("shows an unused tab of the same kind instead of opening a twin of it", () => {
        const home: Tab = {
            name: "Home.Tab",
            value: "home",
            type: "new",
            gameOrigin: { kind: "none" },
        };
        const used = analysisTab("used");
        sessionStorage.setItem(used.value, JSON.stringify({ version: 0, state: { dirty: true } }));
        const unused = analysisTab("unused");
        const tabs = [home, used, unused];
        expect(unusedTabLike(tabs, "used", "analysis")?.value).toBe("unused");
        expect(unusedTabLike(tabs, "used", "new")?.value).toBe("home");
        // The active tab is never "another" tab: the button then opens a new one.
        expect(unusedTabLike([unused], "unused", "analysis")).toBeUndefined();
        expect(unusedTabLike([used], null, "analysis")).toBeUndefined();
    });
});

describe("the sidebar's board", () => {
    beforeEach(() => sessionStorage.clear());

    it("goes to the board used last, otherwise the newest one, never home or training", () => {
        const home: Tab = {
            name: "Home.Tab",
            value: "home",
            type: "new",
            gameOrigin: { kind: "none" },
        };
        const training: Tab = {
            name: "Training",
            value: "training",
            type: "training",
            trainingPath: "/training",
            gameOrigin: { kind: "none" },
        };
        const first = analysisTab("first");
        const second = analysisTab("second");
        const game: Tab = { ...analysisTab("game"), type: "play" };
        const tabs = [first, home, second, game, training];
        expect(boardTabToShow(tabs, "first")?.value).toBe("first");
        // Games have their own entry: the board is an analysis board.
        expect(boardTabToShow(tabs, "game")?.value).toBe("second");
        expect(boardTabToShow(tabs, null)?.value).toBe("second");
        expect(boardTabToShow([home, game, training], null)).toBeUndefined();
    });

    it("shows a game still in its setup instead of opening another", () => {
        const waiting: Tab = { ...analysisTab("waiting"), type: "play" };
        const played: Tab = { ...analysisTab("played"), type: "play" };
        sessionStorage.setItem(
            played.value,
            JSON.stringify({ version: 0, state: { dirty: true } }),
        );
        expect(unusedTabLike([played, waiting], null, "play")?.value).toBe("waiting");
        expect(unusedTabLike([played], null, "play")).toBeUndefined();
    });
});
