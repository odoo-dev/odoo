/** @odoo-module */

import {
    onMounted,
    onPatched,
    onWillPatch,
    onWillUnmount,
    useComponent,
    useRef,
    useState,
} from "@odoo/owl";

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

export function onExternalClick(refName, cb) {
    const ref = useRef(refName);
    function onClick(ev) {
        if (ref.el && !ref.el.contains(ev.target)) {
            cb();
        }
    }
    onMounted(() => {
        document.body.addEventListener("click", onClick, true);
    });
    onWillUnmount(() => {
        document.body.removeEventListener("click", onClick, true);
    });
}

export function useAutoScroll(refName) {
    const ref = useRef(refName);
    let isScrolled = false;
    onMounted(() => {
        ref.el.scrollTop = ref.el.scrollHeight;
    });
    onWillPatch(() => {
        const el = ref.el;
        isScrolled = Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) < 1;
    });
    onPatched(() => {
        if (isScrolled) {
            ref.el.scrollTop = ref.el.scrollHeight;
        }
    });
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
