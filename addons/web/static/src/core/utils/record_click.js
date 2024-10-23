import { useEffect, useRef } from "@odoo/owl";

const EXCLUDED_TAGS = ["a", "button", "img"];
//FIXME must support debounce, I guess...
export function useRecordClick({ refName, onOpen, excludedSelectors = [] }) {
    const _excludedSelectors = [...EXCLUDED_TAGS, ...excludedSelectors];
    const ref = useRef(refName);
    const handleClick = (ev) => {
        if (ev.target.closest(".middle_clickable") !== ref.el) {
            // if the hook is used inside another element using the hook, we must only execute this callback
            return;
        }
        if (!ev.target.classList.contains("middle_clickable")) {
            // keep the default browser behavior if the click on the element is not explicitly handled by the hook
            // case 1 when the hook must handle: <a> tag in an element middle clickable
            // case 2 when the hook must handle: <span> tag in a <button> element middle clickable
            if (ev.target.matches(_excludedSelectors)) {
                return;
            }
            const excludedParent = ev.target.closest(_excludedSelectors);
            if (excludedParent && !excludedParent.classList.contains("middle_clickable")) {
                return;
            }
        }
        const ctrlKey = (ev.ctrlKey && ev.button === 0) || ev.button === 1;
        if ([0, 1].includes(ev.button)) {
            onOpen(ev, ctrlKey);
            ev.preventDefault();
            ev.stopPropagation();
        }
    };
    useEffect(
        () => {
            if (ref.el) {
                const el = ref.el;
                el.classList.add("middle_clickable");
                el.addEventListener("auxclick", handleClick, { capture: true });
                el.addEventListener("click", handleClick, { capture: true });
                return () => {
                    el.removeEventListener("auxclick", handleClick);
                    el.removeEventListener("click", handleClick);
                };
            }
        },
        () => [ref.el]
    );
}
