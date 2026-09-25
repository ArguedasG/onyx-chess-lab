import { useAtom, useAtomValue } from "jotai";
import { useLayoutEffect, useRef } from "react";
import { activeTabAtom, openingScrollFamily } from "@/state/atoms";

export function useOpeningScrollRestoration(key: string, restore = true) {
    const activeTab = useAtomValue(activeTabAtom) ?? "training-openings";
    const [positions, setPositions] = useAtom(openingScrollFamily(activeTab));
    const rootRef = useRef<HTMLDivElement>(null);
    const savedPosition = positions[key] ?? 0;

    useLayoutEffect(() => {
        const viewport = rootRef.current?.closest<HTMLElement>("[data-workspace-content]");
        if (!viewport) return;
        const frame = requestAnimationFrame(() => {
            viewport.scrollTop = restore ? savedPosition : 0;
        });
        return () => {
            cancelAnimationFrame(frame);
            const scrollTop = viewport.scrollTop;
            setPositions((current) =>
                current[key] === scrollTop ? current : { ...current, [key]: scrollTop },
            );
        };
    }, [key, restore, savedPosition, setPositions]);

    return rootRef;
}
