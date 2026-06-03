import { proxy } from "@odoo/owl";
import { useExternalListener, useLayoutEffect } from "@web/owl2/utils";
import { resolveRefEl } from "@web/core/utils/ref_utils";

export function useDropdownAutoVisibility(overlayState, popoverRef) {
    if (!overlayState) {
        return;
    }
    const state = proxy(overlayState);
    const getEl = () => resolveRefEl(popoverRef);
    useLayoutEffect(
        () => {
            const el = getEl();
            if (el) {
                if (!state.isOverlayVisible) {
                    el.style.visibility = "hidden";
                } else {
                    el.style.visibility = "visible";
                }
            }
        },
        () => [state.isOverlayVisible]
    );
}

export function useToolbarDropdownFocus(dropdown, buttonRef) {
    useExternalListener(
        document,
        "keydown",
        (ev) => {
            if (ev.key === "Escape" && dropdown.isOpen) {
                resolveRefEl(buttonRef)?.focus();
            }
        },
        { capture: true }
    );
}
