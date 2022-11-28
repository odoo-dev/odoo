/** @odoo-module */

import { onMounted, onPatched, onWillPatch, onWillUnmount, useComponent, useRef, useState } from "@odoo/owl";

function useExternalListener(target, eventName, handler, eventParams) {
    const boundHandler = handler.bind(useComponent());
    onMounted(() => target().addEventListener(eventName, boundHandler, eventParams));
    onWillUnmount(() => target().removeEventListener(eventName, boundHandler, eventParams));
}

export function removeFromArray(array, elem) {
    const index = array.indexOf(elem);
    if (index >= 0) {
        array.splice(index, 1);
    }
}

const eventHandledWeakMap = new WeakMap();

/**
 * Returns whether the given event has been handled with the given markName.
 *
 * @param {Event} ev
 * @param {string} markName
 * @returns {boolean}
 */
export function isEventHandled(ev, markName) {
    if (!eventHandledWeakMap.get(ev)) {
        return false;
    }
    return eventHandledWeakMap.get(ev).includes(markName);
}

/**
 * Marks the given event as handled by the given markName. Useful to allow
 * handlers in the propagation chain to make a decision based on what has
 * already been done.
 *
 * @param {Event} ev
 * @param {string} markName
 */
export function markEventHandled(ev, markName) {
    if (!eventHandledWeakMap.get(ev)) {
        eventHandledWeakMap.set(ev, []);
    }
    eventHandledWeakMap.get(ev).push(markName);
}

export function htmlToTextContentInline(htmlString) {
    const fragment = document.createDocumentFragment();
    const div = document.createElement("div");
    fragment.appendChild(div);
    htmlString = htmlString.replace(/<br\s*\/?>/gi, " ");
    try {
        div.innerHTML = htmlString;
    } catch {
        div.innerHTML = `<pre>${htmlString}</pre>`;
    }
    return div.textContent
        .trim()
        .replace(/[\n\r]/g, "")
        .replace(/\s\s+/g, " ");
}

export function convertBrToLineBreak(str) {
    return new DOMParser().parseFromString(
        str.replaceAll("<br>", "\n").replaceAll("</br>", "\n"),
        "text/html"
    ).body.textContent;
}

export function onExternalClick(refName, cb) {
    const ref = useRef(refName);
    function onClick(ev) {
        if (ref.el && !ref.el.contains(ev.target)) {
            cb(ev);
        }
    }
    onMounted(() => {
        document.body.addEventListener("click", onClick, true);
    });
    onWillUnmount(() => {
        document.body.removeEventListener("click", onClick, true);
    });
}

export function useAutoScroll(refName, { onApply, onObserve }) {
    const ref = useRef(refName);
    const state = useState({ count: 0 });
    let el = null;
    const observer = new ResizeObserver(() => state.count++);
    const snapshot = {
        scrollHeight: null,
        scrollTop: null,
    };
    function apply() {
        if (!el) {
            return;
        }
        onApply(el);
    }
    function observe() {
        el = ref.el;
        if (!el) {
            return;
        }
        Object.assign(snapshot, {
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop,
        });
        onObserve(el);
    }
    onMounted(() => {
        el = ref.el;
        el.scrollTop = el.scrollHeight;
        observer.observe(el);
        el.addEventListener("scroll", observe);
    });
    onWillUnmount(() => {
        observer.unobserve(el);
        el.removeEventListener("scroll", observe);
    });
    onWillPatch(observe);
    onPatched(apply);
}

export function useHover(refName, callback = () => {}) {
    const ref = useRef(refName);
    const state = useState({ isHover: false });
    function onHover(hovered) {
        state.isHover = hovered;
        callback(hovered);
    }
    useExternalListener(
        () => ref.el,
        "mouseenter",
        () => onHover(true),
        true
    );
    useExternalListener(
        () => ref.el,
        "mouseleave",
        () => onHover(false),
        true
    );
    return state;
}

export function useFocus(refName, callback = () => {}) {
    const ref = useRef(refName);
    const state = useState({ isFocus: false });
    function onFocus(focused) {
        state.isFocus = focused;
        callback(focused);
    }
    useExternalListener(
        () => ref.el,
        "focusin",
        () => onFocus(true),
        true
    );
    useExternalListener(
        () => ref.el,
        "focusout",
        () => onFocus(false),
        true
    );
    return state;
}
