import { useComponent, useLayoutEffect, useRef } from "@web/owl2/utils";

/**
 * Hook used to enrich html and provide automatic links to action.
 * Dom elements must have those attrs [res-id][res-model][view-type]
 * Each element with those attrs will become a link to the specified resource.
 * Works with Iframes.
 *
 * @param {string | { readonly el: HTMLElement | null } | (() => HTMLElement | null)} ref
 *  The container ref. Supports every form that used to work:
 *  - a string ref name (resolved internally via `useRef`);
 *  - a legacy ref object exposing `.el` (incl. `useChildRef`, which is a
 *    function that also exposes an `.el` getter);
 *  - an Owl 3 native signal ref (a function returning the element).
 * @param {string} [selector] Selector to apply to the element resolved by the ref.
 */
export function useEnrichWithActionLinks(ref, selector = null) {
    const comp = useComponent();

    // Resolve the ref to a getter returning the target element, preserving
    // every input form that worked before the Owl 3 signal migration:
    //  - string name: resolved internally via `useRef` (must happen now, in
    //    the hook's setup phase);
    //  - everything else: resolved lazily at call time, where the `.el`
    //    accessor takes precedence over *calling* the ref. This matters for
    //    `useChildRef`, which returns a *function* that also exposes an `.el`
    //    getter (only defined after it has been forwarded) — calling it would
    //    clear its value and return undefined.
    let getRefEl;
    if (typeof ref === "string") {
        const internalRef = useRef(ref);
        getRefEl = () => internalRef.el;
    } else {
        getRefEl = () => {
            if (ref == null) {
                return undefined;
            }
            if (typeof ref !== "function") {
                return ref.el;
            }
            // Forwarded refs (useChildRef) are callables that accept a value
            // (length === 1) and surface the element via an `.el` getter.
            // Never call them; read `.el` (undefined until mounted).
            if (ref.length > 0 || "el" in ref) {
                return ref.el;
            }
            // Owl 3 native signal ref: zero-arg getter. Call it.
            return ref();
        };
    }

    useLayoutEffect(
        (element) => {
            // If we get an iframe, we need to wait until everything is loaded
            if (element.matches("iframe")) {
                element.onload = () => enrich(comp, element, selector, true);
            } else {
                enrich(comp, element, selector);
            }
        },
        () => [getRefEl()]
    );
}

function enrich(component, targetElement, selector, isIFrame = false) {
    let doc = window.document;

    // If we are in an iframe, we need to take the right document
    // both for the element and the doc
    if (isIFrame) {
        targetElement = targetElement.contentDocument;
        doc = targetElement;
    }

    // If there are selector, we may have multiple blocks of code to enrich
    const targets = [];
    if (selector) {
        targets.push(...targetElement.querySelectorAll(selector));
    } else {
        targets.push(targetElement);
    }

    // Search the elements with the selector, update them and bind an action.
    for (const currentTarget of targets) {
        const elementsToWrap = currentTarget.querySelectorAll("[res-id][res-model][view-type]");
        for (const element of elementsToWrap.values()) {
            const wrapper = doc.createElement("a");
            wrapper.setAttribute("href", "#");
            wrapper.addEventListener("click", (ev) => {
                ev.preventDefault();
                component.env.services.action.doAction({
                    type: "ir.actions.act_window",
                    view_mode: element.getAttribute("view-type"),
                    res_id: Number(element.getAttribute("res-id")),
                    res_model: element.getAttribute("res-model"),
                    views: [[element.getAttribute("view-id"), element.getAttribute("view-type")]],
                });
            });
            element.parentNode.insertBefore(wrapper, element);
            wrapper.appendChild(element);
        }
    }
}
