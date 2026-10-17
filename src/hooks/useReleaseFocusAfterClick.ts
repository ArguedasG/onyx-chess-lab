import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { releaseFocusAfterClickAtom } from "@/state/atoms";

/** Controls that keep the arrow keys (tabs, radios) or Space (buttons, switches) once focused. */
const KEY_CAPTURING_CONTROLS =
    'button, [role="tab"], [role="radio"], [role="switch"], input[type="radio"], input[type="checkbox"]';
/** Menus and dialogs move focus on their own and rely on it for Escape and the arrow keys. */
const FOCUS_MANAGING_CONTAINERS = '[role="dialog"], [role="menu"], [role="listbox"]';

/**
 * A control clicked with the mouse would otherwise keep the keyboard: after clicking the
 * "Analysis" tab, the arrows would walk through the tabs instead of the moves. Keyboard users
 * reaching a control with Tab keep it, because only mouse, pen and touch clicks are released.
 */
export function useReleaseFocusAfterClick() {
    const enabled = useAtomValue(releaseFocusAfterClickAtom);

    useEffect(() => {
        if (!enabled) return;
        let pointerClick = false;
        const onPointerDown = () => {
            pointerClick = true;
        };
        const onKeyDown = () => {
            pointerClick = false;
        };
        const onClick = (event: MouseEvent) => {
            if (!pointerClick) return;
            pointerClick = false;
            const target = event.target instanceof Element ? event.target : null;
            // The focus can land after the click (a label passes it to its input), so look later.
            setTimeout(() => {
                const focused = document.activeElement;
                if (!(focused instanceof HTMLElement) || !target) return;
                const label = target.closest("label");
                const clicked =
                    target.contains(focused) ||
                    focused.contains(target) ||
                    label?.control === focused;
                if (
                    clicked &&
                    focused.matches(KEY_CAPTURING_CONTROLS) &&
                    !focused.matches('[aria-haspopup], [aria-expanded="true"]') &&
                    !focused.closest(FOCUS_MANAGING_CONTAINERS)
                ) {
                    focused.blur();
                }
            }, 0);
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("click", onClick, true);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("click", onClick, true);
        };
    }, [enabled]);
}
