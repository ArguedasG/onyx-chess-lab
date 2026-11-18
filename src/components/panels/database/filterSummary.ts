import type { TFunction } from "i18next";
import type { WeakGamesFilter } from "@/bindings";
import { activeWeakFilter } from "@/state/atoms";
import { capitalize } from "@/utils/format";
import type { LichessGamesOptions, MasterGamesOptions } from "@/utils/lichess/explorer";
import type { LocalOptions } from "./DatabasePanel";

const RESULTS = { whitewon: "1-0", draw: "½-½", blackwon: "0-1" } as const;

/** "1600–2000", "1600–", "–2000", or null when neither end is set. */
function span(from: string | null | undefined, to: string | null | undefined) {
    if (!from && !to) return null;
    if (from && to) return from === to ? from : `${from}–${to}`;
    return from ? `${from}–` : `–${to}`;
}

const year = (date: string | Date | null | undefined) =>
    date == null ? null : typeof date === "string" ? date.slice(0, 4) : String(date.getFullYear());

const month = (date: Date | undefined) =>
    date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : null;

/**
 * The query's filters in a few words each ("Blitz, rapid", "1600–2000", "1-0"), so the toolbar
 * can say what is filtered without opening the filters. Empty when nothing narrows the query.
 */
export function filterSummary(
    source: "local" | "lch_all" | "lch_master",
    options: {
        local: LocalOptions;
        lichess: LichessGamesOptions;
        masters: MasterGamesOptions;
        weak: WeakGamesFilter;
    },
    t: TFunction,
): string[] {
    const parts: string[] = [];
    const colorName = (color: string | undefined) =>
        color === "white" ? t("Common.White") : color === "black" ? t("Common.Black") : null;

    if (source === "local") {
        const { local } = options;
        if (local.player != null) {
            const color = colorName(local.color);
            const player = t("Board.Database.Filters.Player", "Player");
            parts.push(color ? `${player} (${color})` : player);
        }
        const elo = span(local.elo_min?.toString(), local.elo_max?.toString());
        if (elo) parts.push(`Elo ${elo}`);
        const dates = span(year(local.start_date), year(local.end_date));
        if (dates) parts.push(dates);
        if (local.result !== "any") parts.push(RESULTS[local.result]);
        const weak = activeWeakFilter(options.weak);
        if (weak) {
            parts.push(
                weak.below != null
                    ? t("Board.Database.Filters.Weak", "No weak games < {{elo}}", {
                          elo: weak.below,
                      })
                    : t("Board.Database.Weak.ActiveUnrated", "Without unrated games"),
            );
        }
    } else if (source === "lch_all") {
        const { lichess } = options;
        const speeds = lichess.speeds ?? [];
        if (speeds.length > 3) {
            parts.push(
                t("Board.Database.Filters.Speeds", "{{count}} time controls", {
                    count: speeds.length,
                }),
            );
        } else if (speeds.length) {
            parts.push(speeds.map((speed) => t(`TimeControl.${capitalize(speed)}`)).join(", "));
        }
        const ratings = [...(lichess.ratings ?? [])]
            .sort((a, b) => a - b)
            .map((rating) => (rating === 0 ? "400" : String(rating)));
        if (ratings.length > 3) parts.push(span(ratings[0], ratings[ratings.length - 1])!);
        else if (ratings.length) parts.push(ratings.join(", "));
        const dates = span(month(lichess.since), month(lichess.until));
        if (dates) parts.push(dates);
        if (lichess.player) {
            const color = colorName(lichess.color);
            parts.push(color ? `${lichess.player} (${color})` : lichess.player);
        }
    } else {
        const dates = span(year(options.masters.since), year(options.masters.until));
        if (dates) parts.push(dates);
    }
    return parts;
}
