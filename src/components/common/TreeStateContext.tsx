import { createContext, useEffect, useState } from "react";
import { createTreeStore, type TreeStore } from "@/state/store/tree";
import { registerMountedTreeStore } from "@/state/store/tabTreeStores";
import type { TreeState } from "@/utils/treeReducer";

export const TreeStateContext = createContext<TreeStore | null>(null);

export function TreeStateProvider({
  id,
  initial,
  children,
}: {
  id?: string;
  initial?: TreeState;
  children: React.ReactNode;
}) {
  // Lazy: creating a persisted store re-reads and parses the whole tree from session storage.
  const [store] = useState(() => createTreeStore(id, initial));

  useEffect(() => (id ? registerMountedTreeStore(id, store) : undefined), [id, store]);

  return <TreeStateContext.Provider value={store}>{children}</TreeStateContext.Provider>;
}
