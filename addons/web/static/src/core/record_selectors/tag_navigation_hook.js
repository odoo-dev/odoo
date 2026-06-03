import { useRef } from "@web/owl2/utils";
import { useNavigation } from "../navigation/navigation";
import { resolveRefEl } from "@web/core/utils/ref_utils";

/**
 * This hook allows to navigate between tags in a record selector. It also
 * allows to delete tags with the backspace key.
 * It is meant to be used in component which contains both the components
 * `Autocomplete` and `TagList`.
 *
 * @param {string|object|(() => HTMLElement)} refName Name of the t-ref which contains
 *      the `Autocomplete` and `TagList` components, or a ref object / Owl 3 native
 *      signal ref pointing to that container.
 * @param {object} [options]
 * @param {() => boolean} [options.isEnabled]
 * @param {(index: number) => void} [options.delete] Function to be called when a tag is deleted. It should take the index of the tag to delete as parameter.
 */
export function useTagNavigation(refName, options = {}) {
    // Backward-compatible: a string is resolved through the (compat) `useRef`,
    // exactly as before. A ref object or an Owl 3 native signal ref is used
    // directly (both are accepted by `useNavigation`, which resolves them).
    const tagsContainerRef = typeof refName === "string" ? useRef(refName) : refName;

    const isEnabled = options.isEnabled ?? (() => true);

    const canRemoveTag = (target) =>
        options.delete && (target.tagName.toLowerCase() !== "input" || !target.value);

    const onBackspaceKeydown = (navigator) => {
        const el = navigator.activeItem.el;
        if (el.classList.contains("o-autocomplete--input")) {
            if (!el.value && navigator.items.length > 1) {
                options.delete(navigator.items.length - 2);
            }
        } else {
            options.delete(navigator.activeItemIndex);
        }
        navigator.items.at(-1).setActive();
    };

    const canNavigateFromInput = (navigator, navNext) => {
        const el = navigator.activeItem.el;
        if (el.classList.contains("o-autocomplete--input")) {
            if (el.value.length) {
                return false;
            }
        }
        return true;
    };

    useNavigation(tagsContainerRef, {
        getItems: () =>
            resolveRefEl(tagsContainerRef)?.querySelectorAll(
                ":scope .o_tag, :scope .o-autocomplete--input"
            ) ?? [],
        isNavigationAvailable: ({ navigator, target }) =>
            isEnabled() && navigator.isFocused && navigator.contains(target),
        hotkeys: {
            tab: null,
            "shift+tab": null,
            home: null,
            end: null,
            enter: null,
            arrowup: null,
            arrowdown: null,
            backspace: {
                bypassEditableProtection: true,
                isAvailable: ({ target }) => canRemoveTag(target),
                callback: (navigator) => onBackspaceKeydown(navigator),
            },
            arrowleft: {
                bypassEditableProtection: true,
                isAvailable: ({ navigator }) => canNavigateFromInput(navigator, false),
                callback: (navigator) => navigator.previous(),
            },
            arrowright: {
                bypassEditableProtection: true,
                isAvailable: ({ navigator }) => canNavigateFromInput(navigator, true),
                callback: (navigator) => navigator.next(),
            },
        },
    });
}
