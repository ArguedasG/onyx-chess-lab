import type { ManagedMaiaInstallation, UciOptionConfig } from "@/bindings";
import { type LocalEngine, requiredEngineSettings } from "./engines";

export const MANAGED_MAIA_PROGRESS_ID = "managed_maia3";

/**
 * Whether Onyx installs Maia 3 by itself on this system: Windows x64, macOS (Apple Silicon needs
 * macOS 14 or newer) and Linux x64. Other architectures get a clear error from the installer.
 */
export function supportsManagedMaia(os: string | undefined): boolean {
    return os === "windows" || os === "macos" || os === "linux";
}

export function managedMaiaToLocalEngine(
    installation: ManagedMaiaInstallation,
    options: UciOptionConfig[],
    existingId?: string,
): LocalEngine {
    return {
        type: "local",
        id: existingId ?? crypto.randomUUID(),
        name: installation.name,
        version: installation.version,
        path: installation.path,
        args: installation.args,
        elo: installation.elo,
        loaded: true,
        settings: options
            .filter((option) => option.type !== "button")
            .filter((option) => requiredEngineSettings.includes(option.value.name))
            .map((option) => {
                const defaultValue = option.value.default;
                return {
                    name: option.value.name,
                    value: typeof defaultValue === "bigint" ? Number(defaultValue) : defaultValue,
                };
            }),
        managed: {
            provider: "onyx",
            kind: "maia3",
            version: installation.version,
        },
    };
}

export function isManagedMaia(engine: LocalEngine): boolean {
    return engine.managed?.provider === "onyx" && engine.managed.kind === "maia3";
}
