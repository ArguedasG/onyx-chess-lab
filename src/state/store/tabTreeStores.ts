import { getLatestSessionStorageValue } from "./debouncedStorage";
import { createTreeStore, type TreeStore } from "./tree";

/** Mounted stores by tab id; switching tabs unmounts a tab and remounts it with a fresh store. */
const mountedTabStores = new Map<string, TreeStore>();

export function registerMountedTreeStore(id: string, store: TreeStore): () => void {
    mountedTabStores.set(id, store);
    return () => {
        if (mountedTabStores.get(id) === store) mountedTabStores.delete(id);
    };
}

/**
 * Runs `update` on the tab's live store, or on its persisted state when the tab is not on
 * screen, so long-running work started in a tab survives the user switching tabs meanwhile.
 * Returns false when the tab no longer exists.
 */
export function updateTabTreeStore(id: string, update: (store: TreeStore) => void): boolean {
    const mounted = mountedTabStores.get(id);
    if (mounted) {
        update(mounted);
        return true;
    }
    if (getLatestSessionStorageValue(id) === null) return false;
    // A persisted store hydrates synchronously from session storage and writes changes back.
    update(createTreeStore(id));
    return true;
}
