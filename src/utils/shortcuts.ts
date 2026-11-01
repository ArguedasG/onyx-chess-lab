/**
 * Readable names for the keys of a shortcut ("shift+arrowright" → ["Shift", "→"]), shown in
 * tooltips and first-time hints. Several shortcuts for one action are separated by commas.
 */
const KEY_NAMES: Record<string, string> = {
    arrowright: "→",
    arrowleft: "←",
    arrowup: "↑",
    arrowdown: "↓",
    right: "→",
    left: "←",
    up: "↑",
    down: "↓",
    shift: "Shift",
    ctrl: "Ctrl",
    control: "Ctrl",
    alt: "Alt",
    meta: "Ctrl",
    cmd: "Ctrl",
    delete: "Del",
    backspace: "⌫",
    escape: "Esc",
    enter: "Enter",
    space: "Space",
    tab: "Tab",
};

const MAC_KEY_NAMES: Record<string, string> = {
    meta: "⌘",
    cmd: "⌘",
    ctrl: "⌃",
    control: "⌃",
    shift: "⇧",
    alt: "⌥",
};

/** Every shortcut of an action, each one as the list of its keys. */
export function shortcutKeys(keys: string, mac = false): string[][] {
    return keys
        .split(",")
        .map((combo) => combo.trim())
        .filter(Boolean)
        .map((combo) =>
            combo.split("+").map((key) => {
                const lower = key.trim().toLowerCase();
                if (mac && MAC_KEY_NAMES[lower]) return MAC_KEY_NAMES[lower];
                return KEY_NAMES[lower] ?? (lower.length === 1 ? lower.toUpperCase() : key.trim());
            }),
        );
}
