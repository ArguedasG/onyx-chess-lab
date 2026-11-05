import { join, resolve } from "@tauri-apps/api/path";
import type { Platform } from "@tauri-apps/plugin-os";
import { commands, type ManagedMaiaInstallation } from "@/bindings";
import { loadEngineCatalog } from "./catalog";
import { getEnginesDir } from "./directories";
import { type Engine, type LocalEngine, requiredEngineSettings } from "./engines";
import { isMaiaEngine } from "./humanBots";
import { isManagedMaia, MANAGED_MAIA_PROGRESS_ID, managedMaiaToLocalEngine } from "./managedMaia";
import { unwrap } from "./unwrap";

/** A catalog entry; `extractTo` is the folder its archive is unpacked into, if not the root. */
export type CatalogEngine = LocalEngine & { extractTo?: string };

/** Progress id of the Stockfish download started from the recommended engines. */
export const RECOMMENDED_STOCKFISH_PROGRESS_ID = "recommended_stockfish";

/**
 * Remote images (the catalog's logos) are blocked by the app's content security policy, so only
 * local files picked by the user are shown; everything else falls back to an icon.
 */
export function displayableEngineImage(image: string | null | undefined): string | null {
    if (!image || /^https?:/i.test(image)) return null;
    return image;
}

/** Downloads a catalog engine and returns the entry to add to the engine list. */
export async function downloadCatalogEngine(
    engine: CatalogEngine,
    progressId: string,
): Promise<LocalEngine> {
    const url = engine.downloadLink;
    if (!url) throw new Error(`${engine.name} has no download link`);
    const enginesDir = await getEnginesDir();
    let path = await resolve(enginesDir, `${url.slice(url.lastIndexOf("/") + 1)}`);
    if (url.endsWith(".zip") || url.endsWith(".tar")) {
        // Some archives (Lc0's official ones) have their files at the root, not in a folder.
        path = engine.extractTo ? await resolve(enginesDir, engine.extractTo) : enginesDir;
    }
    await commands.downloadFile(progressId, url, path, null, null, null);
    let enginesDirPath = enginesDir;
    if (enginesDirPath.endsWith("/") || enginesDirPath.endsWith("\\")) {
        enginesDirPath = enginesDirPath.slice(0, -1);
    }
    const enginePath = await join(enginesDirPath, ...engine.path.split("/"));
    await commands.setFileAsExecutable(enginePath);
    const args = engine.args ?? [];
    const config = unwrap(await commands.getEngineConfig(enginePath, args));
    const { extractTo: _extractTo, image: _image, ...installed } = engine;
    return {
        ...installed,
        id: crypto.randomUUID(),
        type: "local",
        path: enginePath,
        args,
        loaded: true,
        settings: config.options
            .filter((o) => requiredEngineSettings.includes(o.value.name))
            .map((o) => ({
                name: o.value.name,
                // @ts-expect-error UCI defaults are strings, numbers or booleans here
                value: o.value.default,
            })),
    };
}

/** The Stockfish entry of the engine catalog for this computer. */
export async function findCatalogStockfish(os: Platform): Promise<CatalogEngine | null> {
    const bmi2 = await commands.isBmi2Compatible();
    const engines = await loadEngineCatalog<
        CatalogEngine & { os: Platform; bmi2: boolean; downloadLink: string }
    >(`?os=${os}&bmi2=${bmi2}`);
    return (
        engines.find((e) => e.os === os && e.bmi2 === bmi2 && /^stockfish/i.test(e.name)) ?? null
    );
}

/**
 * Installs the managed Maia 3 and returns its registered engine entry. An installation left
 * half done is repaired; one already on disk is only registered again.
 */
export async function installManagedMaiaEngine(
    existingId?: string,
): Promise<{ installation: ManagedMaiaInstallation; engine: LocalEngine }> {
    const enginesDir = await getEnginesDir();
    const status = await commands.getManagedMaiaStatus(enginesDir);
    const repair = status.status === "ok" && status.data.needsRepair;
    const result = await commands.installManagedMaia(MANAGED_MAIA_PROGRESS_ID, enginesDir, repair);
    if (result.status !== "ok") throw new Error(result.error);
    const installation = result.data;
    const config = unwrap(await commands.getEngineConfig(installation.path, installation.args));
    return {
        installation,
        engine: managedMaiaToLocalEngine(installation, config.options, existingId),
    };
}

/** Replaces the registered managed Maia, if any, with `engine`. */
export function withManagedMaia(engines: Engine[], engine: LocalEngine): Engine[] {
    const existing = engines.find((e): e is LocalEngine => e.type === "local" && isManagedMaia(e));
    return [...engines.filter((e) => e !== existing), engine];
}

/** The local Stockfish (or other reference engine) the bots and analysis use, if installed. */
export function hasReferenceEngine(engines: Engine[] | null | undefined): boolean {
    return (engines ?? []).some(
        (engine) => engine.type === "local" && Boolean(engine.path) && !isMaiaEngine(engine),
    );
}

export function hasMaiaEngine(engines: Engine[] | null | undefined): boolean {
    return (engines ?? []).some(
        (engine) => engine.type === "local" && Boolean(engine.path) && isMaiaEngine(engine),
    );
}
