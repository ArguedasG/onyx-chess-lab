/**
 * The app's own confirmation dialog, as a promise. It replaces the operating system's dialog
 * (`ask` from the Tauri dialog plugin), which looked out of place: the question is shown by
 * `ConfirmDialogHost`, mounted once in the root layout, with the app's theme and language.
 */
export type ConfirmDialogOptions = {
    title: string;
    message: string;
    /** Label of the confirm button; "Continue" when left out. */
    confirmLabel?: string;
    /** Red confirm button, for deleting or replacing something. */
    danger?: boolean;
};

export type PendingConfirm = ConfirmDialogOptions & { id: number };

type Entry = PendingConfirm & { resolve: (confirmed: boolean) => void };

let nextId = 1;
const queue: Entry[] = [];
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) listener();
}

/** Resolves `true` when the user confirms and `false` when they cancel or close the dialog. */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise((resolve) => {
        queue.push({ ...options, id: nextId++, resolve });
        notify();
    });
}

/** The question on screen; others wait their turn. */
export function currentConfirm(): PendingConfirm | null {
    return queue[0] ?? null;
}

export function subscribeConfirm(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function answerConfirm(id: number, confirmed: boolean) {
    const index = queue.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [entry] = queue.splice(index, 1);
    entry.resolve(confirmed);
    notify();
}
