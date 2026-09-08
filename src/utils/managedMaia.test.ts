import { describe, expect, it } from "vitest";
import type { ManagedMaiaInstallation, UciOptionConfig } from "@/bindings";
import { isManagedMaia, managedMaiaToLocalEngine } from "./managedMaia";

const installation: ManagedMaiaInstallation = {
    name: "Maia 3 5M",
    version: "0.1.0",
    path: "C:\\engines\\managed\\maia3\\.venv\\Scripts\\maia3-5m.exe",
    args: ["--local-files-only"],
    elo: 2600,
    installedSizeMb: 660,
    requiredFreeSpaceMb: 1500,
    sourceUrl: "https://github.com/CSSLab/maia3",
    sourceRevision: "source-revision",
    modelUrl: "https://huggingface.co/UofTCSSLab/Maia3-5M",
    modelRevision: "model-revision",
    modelSha256: "model-sha256",
    license: "AGPL-3.0",
    pythonVersion: "3.11.16",
    uvVersion: "0.12.10",
};

describe("managed Maia registration", () => {
    it("keeps the existing identity during repair and stores only supported defaults", () => {
        const options: UciOptionConfig[] = [
            {
                type: "spin",
                value: {
                    name: "MultiPV",
                    default: BigInt(1),
                    min: BigInt(1),
                    max: BigInt(10),
                },
            },
            { type: "button", value: { name: "Clear Hash" } },
            { type: "string", value: { name: "Model", default: "maia3-5m" } },
        ];

        const engine = managedMaiaToLocalEngine(installation, options, "existing-maia");

        expect(engine.id).toBe("existing-maia");
        expect(engine.settings).toEqual([{ name: "MultiPV", value: 1 }]);
        expect(engine.args).toContain("--local-files-only");
        expect(isManagedMaia(engine)).toBe(true);
    });

    it("does not classify a manually configured Maia engine as Onyx-managed", () => {
        expect(
            isManagedMaia({
                type: "local",
                id: "manual",
                name: "Maia 3 manual",
                version: "",
                path: "C:\\maia3.exe",
                args: [],
            }),
        ).toBe(false);
    });
});
