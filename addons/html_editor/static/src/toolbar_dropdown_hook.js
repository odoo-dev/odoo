import { useExternalListener, useLayoutEffect, useState } from "@web/owl2/utils";

export function useDropdownAutoVisibility(overlayState, popoverRef) {
    if (!overlayState) {
        return;
    }
    const state = useState(overlayState);
    // Resolve the element regardless of ref kind, preserving every legacy form and only ADDING
    // the Owl 3 signal case:
    // - undefined/optional ref       -> undefined (no crash; mirrors the old `popoverRef.el`)
    // - object refs (useRef)         -> `.el`
    // - forwarded refs (useChildRef) -> a callable that ALSO exposes an `.el` getter once it has
    //                                   received its child value. `.el` must take precedence over
    //                                   calling it; calling such a ref with no argument sets its
    //                                   inner value to undefined and makes later `.el` reads throw
    //                                   "Cannot read properties of undefined (reading 'el')".
    //                                   It also takes a value argument (arity 1), so we never call
    //                                   it: before it is mounted `.el` is simply absent (undefined),
    //                                   exactly like the original direct `popoverRef.el` read.
    // - Owl 3 native signal refs     -> a zero-argument callable with no `.el`; resolved by calling.
    const getEl = () => {
        if (popoverRef == null) {
            return undefined;
        }
        // Legacy contract: object refs (useRef) and mounted forwarded refs (useChildRef) expose
        // the element through `.el`. Matches the original `popoverRef.el`.
        if (typeof popoverRef !== "function") {
            return popoverRef.el;
        }
        // Forwarded refs (useChildRef) are callables that accept a value (length === 1) and surface
        // the element via an `.el` getter. Never call them; read `.el` (undefined until mounted).
        if (popoverRef.length > 0 || "el" in popoverRef) {
            return popoverRef.el;
        }
        // Owl 3 native signal ref: a zero-argument getter. Call it to read the element.
        return popoverRef();
    };
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
                buttonRef.el.focus();
            }
        },
        { capture: true }
    );
}
