import { expect, it, vi } from "vitest";
import type { StoredPlayerAnalysis } from "@/state/playerAnalysis";
import { PLAYER_ANALYSIS_SCHEMA_VERSION } from "./playerAnalysis";
import { playerAnalysisHtml } from "./playerAnalysisExport";

vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ exists: vi.fn(), writeTextFile: vi.fn() }));

it("escapes profile-controlled text in the standalone HTML export", () => {
    const profile = {
        schemaVersion: PLAYER_ANALYSIS_SCHEMA_VERSION,
        profileId: "test",
        playerName: '<script>alert("x")</script>',
        updatedAt: "2026-09-15T00:00:00Z",
        metadata: {
            schemaVersion: PLAYER_ANALYSIS_SCHEMA_VERSION,
            generatedAt: "2026-09-15T00:00:00Z",
            playerName: "Test",
            sources: [],
            filters: {
                startDate: null,
                endDate: null,
                color: "any",
                opponentEloMin: null,
                opponentEloMax: null,
                timeControl: null,
            },
            sampleSize: 0,
            summary: {
                key: "all",
                games: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                unknown: 0,
                scorePercent: null,
                averagePlayerElo: null,
                averageOpponentElo: null,
                references: [],
            },
            byColor: [],
            byTimeControl: [],
            byOpponentRating: [],
            byRatingDifference: [],
            openings: [],
            opponents: [],
            byYear: [],
            findings: [],
        },
        engine: null,
    } satisfies StoredPlayerAnalysis;

    const html = playerAnalysisHtml(profile);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
});
