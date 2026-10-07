import type { GameManifest } from "@/bindings";
import { getPGN } from "./chess";
import { serializeGameManifest } from "./gameManifest";
import type { GameHeaders, TreeNode } from "./treeReducer";

function cloneLineToPath(node: TreeNode, path: number[]): TreeNode {
    const clone: TreeNode = {
        ...node,
        children: [],
        shapes: [...node.shapes],
        annotations: [...node.annotations],
    };
    if (path.length === 0) return clone;

    const child = node.children[path[0]];
    if (child) {
        clone.children = [cloneLineToPath(child, path.slice(1))];
    }
    return clone;
}

export function buildModelGameSourcePgn(
    root: TreeNode,
    headers: GameHeaders,
    position: number[],
): string {
    return getPGN(cloneLineToPath(root, position), {
        headers: { ...headers, result: "*" },
        glyphs: false,
        comments: false,
        variations: false,
        extraMarkups: false,
    });
}

export function getModelGameArtifactPaths(selectedPath: string): {
    pgnPath: string;
    manifestPath: string;
} {
    const pgnPath = selectedPath.toLowerCase().endsWith(".pgn")
        ? selectedPath
        : `${selectedPath}.pgn`;
    return {
        pgnPath,
        manifestPath: pgnPath.replace(/\.pgn$/i, ".manifest.json"),
    };
}

export function serializeModelGameArtifacts(
    pgn: string,
    manifest: GameManifest,
): { pgn: string; manifest: string } {
    return {
        pgn: `${pgn.trim()}\n`,
        manifest: serializeGameManifest(manifest),
    };
}

/** One multi-game PGN from experiment artifacts, in the given order. */
export function combineModelGamePgns(pgns: string[]): string {
    return `${pgns
        .map((pgn) => pgn.trim())
        .filter(Boolean)
        .join("\n\n")}\n`;
}

/** Writes selected experiment games to app data so PGN-based importers can read them. */
export async function writeModelGameSelectionPgn(pgn: string): Promise<string> {
    const { appDataDir, resolve } = await import("@tauri-apps/api/path");
    const { BaseDirectory, exists, mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const directory = "model-games/selections";
    if (!(await exists(directory, { baseDir: BaseDirectory.AppData }))) {
        await mkdir(directory, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    const relative = `${directory}/selection-${Date.now()}.pgn`;
    await writeTextFile(relative, pgn, { baseDir: BaseDirectory.AppData });
    return resolve(await appDataDir(), relative);
}
