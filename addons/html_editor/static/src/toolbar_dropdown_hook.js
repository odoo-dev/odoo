import { useOverlayState } from "@html_editor/overlay_state";
import { untrack, useEffect, useListener } from "@odoo/owl";

export function useDropdownAutoVisibility(popoverRef) {
    const state = useOverlayState();
    if (!state) {
        return;
    }
    const getEl = () => untrack(popoverRef);
    useEffect(() => {
        const isOverlayVisible = state.isVisible();
        const el = getEl();
        if (el) {
            if (!isOverlayVisible) {
                el.style.visibility = "hidden";
            } else {
                el.style.visibility = "visible";
            }
        }
    });
}

export function useToolbarDropdownFocus(dropdown, buttonRef) {
    useListener(
        document,
        "keydown",
        (ev) => {
            if (ev.key === "Escape" && dropdown.isOpen) {
                buttonRef()?.focus();
            }
        },
        { capture: true }
    );
}
