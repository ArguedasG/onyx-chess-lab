import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { getDefaultStore } from "jotai";
import { commands } from "@/bindings/generated";
import { soundCollectionAtom, soundVolumeAtom } from "@/state/atoms";

const POOL_SIZE = 5;
const audioPool = Array.from({ length: POOL_SIZE }, () => new Audio());
let poolIndex = 0;

let soundServerPort: number | null = null;
const soundUrlCache = new Map<string, string>();

function isLinux(): boolean {
    try {
        return platform() === "linux";
    } catch {
        return false;
    }
}

let lastTime = 0;

async function getSoundServerPort(): Promise<number> {
    if (soundServerPort !== null) {
        return soundServerPort;
    }
    const result = await commands.getSoundServerPort();
    if (result.status === "ok") {
        soundServerPort = result.data;
        return soundServerPort;
    }
    throw new Error("Failed to get sound server port");
}

export function playSound(capture: boolean, check: boolean) {
    // only play at most 1 sound every 75ms
    const now = Date.now();
    if (now - lastTime < 75) {
        return;
    }
    lastTime = now;

    const store = getDefaultStore();
    const collection = store.get(soundCollectionAtom);
    const volume = store.get(soundVolumeAtom);

    let type = "Move";
    if (capture) {
        type = "Capture";
    }
    if (collection !== "standard" && check) {
        type = "Check";
    }

    const cacheKey = `${collection}/${type}`;

    const playWithUrl = (url: string) => {
        const player = audioPool[poolIndex];
        poolIndex = (poolIndex + 1) % POOL_SIZE;

        player.src = url;
        player.volume = volume;
        player.play().catch((e) => console.error("Audio playback error:", e));
    };

    if (isLinux()) {
        getSoundServerPort()
            .then((port) => {
                const url = `http://127.0.0.1:${port}/${collection}/${type}.mp3`;
                playWithUrl(url);
            })
            .catch(() => {
                // fails if Tauri APIs are unavailable (e.g., in tests)
            });
    } else {
        const path = `sound/${collection}/${type}.mp3`;

        if (soundUrlCache.has(cacheKey)) {
            playWithUrl(soundUrlCache.get(cacheKey)!);
            return;
        }
        resolveResource(path)
            .then((filePath) => {
                const assetUrl = convertFileSrc(filePath);
                soundUrlCache.set(cacheKey, assetUrl);

                playWithUrl(assetUrl);
            })
            .catch(() => {
                // fails if Tauri APIs are unavailable (e.g., in tests)
            });
    }
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
        return null;
    }
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") {
        void audioContext.resume();
    }
    return audioContext;
}

type Tone = { frequency: number; start: number; duration: number; type?: OscillatorType };

function playTones(tones: Tone[], gain: number) {
    const volume = getDefaultStore().get(soundVolumeAtom);
    if (volume <= 0) return;
    const context = getAudioContext();
    if (!context) return;
    const now = context.currentTime;
    for (const tone of tones) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = tone.type ?? "sine";
        oscillator.frequency.value = tone.frequency;
        const start = now + tone.start;
        const end = start + tone.duration;
        // Short attack and exponential release so the tones do not click.
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(gain * volume, start + 0.01);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(envelope).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.02);
    }
}

/** Two rising notes for a correct training move (tactics, openings, mistake review). */
export function playCorrectSound() {
    try {
        playTones(
            [
                { frequency: 659.25, start: 0, duration: 0.14 },
                { frequency: 987.77, start: 0.09, duration: 0.24 },
            ],
            0.22,
        );
    } catch {
        // Audio is optional; never break the training flow over it.
    }
}

/** Short double beep when the player's clock enters the low-time zone. */
export function playLowTimeSound() {
    try {
        playTones(
            [
                { frequency: 880, start: 0, duration: 0.12, type: "triangle" },
                { frequency: 880, start: 0.2, duration: 0.12, type: "triangle" },
            ],
            0.3,
        );
    } catch {
        // Audio is optional.
    }
}

/** End of a game: a rising chord for a win, a falling one for a loss, a flat one for a draw. */
export function playGameEndSound(kind: "win" | "loss" | "draw") {
    const notes = {
        win: [523.25, 659.25, 783.99],
        loss: [392, 329.63, 261.63],
        draw: [440, 440, 523.25],
    }[kind];
    try {
        playTones(
            notes.map((frequency, index) => ({
                frequency,
                start: index * 0.12,
                duration: index === notes.length - 1 ? 0.45 : 0.16,
                type: "triangle" as const,
            })),
            0.25,
        );
    } catch {
        // Audio is optional.
    }
}

/** Seconds below which a clock counts as low: an eighth of the initial time, within 10–60 s. */
export function lowTimeThresholdSeconds(initialSeconds: number) {
    return Math.min(60, Math.max(10, initialSeconds * 0.125));
}
