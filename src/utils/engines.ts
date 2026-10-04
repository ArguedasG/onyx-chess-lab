import type { Platform } from "@tauri-apps/plugin-os";
import useSWR from "swr";
import { z } from "zod";
import { type BestMoves, commands, type EngineOptions, type GoMode } from "@/bindings";
import { CATALOG_SWR_OPTIONS, fetchCatalog } from "./http";
import { unwrap } from "./unwrap";

export const requiredEngineSettings = ["MultiPV", "Threads", "Hash"];
export const RANDOM_SEED_PLACEHOLDER = "{{randomSeed}}";

const goModeSchema: z.ZodSchema<GoMode> = z.union([
    z.object({
        t: z.literal("Depth"),
        c: z.number(),
    }),
    z.object({
        t: z.literal("Time"),
        c: z.number(),
    }),
    z.object({
        t: z.literal("Nodes"),
        c: z.number(),
    }),
    z.object({
        t: z.literal("Infinite"),
    }),
]);

const engineSettingsSchema = z.array(
    z.object({
        name: z.string(),
        value: z.string().or(z.number()).or(z.boolean()).nullable(),
    }),
);

export type EngineSettings = z.infer<typeof engineSettingsSchema>;

const localEngineSchema = z.object({
    type: z.literal("local"),
    id: z.string().default(() => crypto.randomUUID()),
    name: z.string(),
    version: z.string(),
    path: z.string(),
    args: z.array(z.string()).default([]),
    image: z.string().nullish(),
    elo: z.number().nullish(),
    downloadSize: z.number().nullish(),
    downloadLink: z.string().nullish(),
    loaded: z.boolean().nullish(),
    go: goModeSchema.nullish(),
    enabled: z.boolean().nullish(),
    settings: engineSettingsSchema.nullish(),
    managed: z
        .object({
            provider: z.literal("onyx"),
            kind: z.literal("maia3"),
            version: z.string(),
        })
        .nullish(),
});

export type LocalEngine = z.output<typeof localEngineSchema>;

const remoteEngineSchema = z.object({
    type: z.enum(["chessdb", "lichess"]),
    id: z.string().default(() => crypto.randomUUID()),
    name: z.string(),
    url: z.string(),
    image: z.string().nullish(),
    loaded: z.boolean().nullish(),
    enabled: z.boolean().nullish(),
    go: goModeSchema.nullish(),
    settings: engineSettingsSchema.nullish(),
});

export type RemoteEngine = z.output<typeof remoteEngineSchema>;

export const engineSchema = z.union([localEngineSchema, remoteEngineSchema]);
export type Engine = z.output<typeof engineSchema>;

export function stopEngine(engine: LocalEngine, tab: string): Promise<void> {
    return commands.stopEngine(engine.id, tab).then((r) => {
        unwrap(r);
    });
}

export function killEngine(engine: LocalEngine, tab: string): Promise<void> {
    return commands.killEngine(engine.id, tab).then((r) => {
        unwrap(r);
    });
}

export function getBestMoves(
    engine: LocalEngine,
    tab: string,
    goMode: GoMode,
    options: EngineOptions,
): Promise<[number, BestMoves[]] | null> {
    return commands
        .getBestMoves(engine.id, engine.path, engine.args ?? [], tab, goMode, options)
        .then((r) => unwrap(r));
}

export function getBestMovesOnce(
    engine: LocalEngine,
    goMode: GoMode,
    options: EngineOptions,
    timeoutMs = 8_000,
): Promise<BestMoves[]> {
    return commands
        .getBestMovesOnce(engine.path, engine.args ?? [], goMode, options, timeoutMs)
        .then((r) => unwrap(r));
}

export function useDefaultEngines(os: Platform | undefined, opened: boolean) {
    const { data, error, isLoading, mutate } = useSWR(
        opened ? os : null,
        async (os: Platform) => {
            const bmi2: boolean = await commands.isBmi2Compatible();
            const engines = await fetchCatalog<(LocalEngine & { os: Platform; bmi2: boolean })[]>(
                `/engines.json?os=${os}&bmi2=${bmi2}`,
            );
            return engines.filter((e) => e.os === os && e.bmi2 === bmi2);
        },
        CATALOG_SWR_OPTIONS,
    );
    return {
        defaultEngines: data as LocalEngine[],
        // A failed background refresh keeps the list already shown.
        error: data ? undefined : error,
        isLoading,
        retry: () => mutate(),
    };
}
