import { useEffect, useRef } from "@odoo/owl";

const EXCLUDED_TAGS = ["A", "IMG"];

export function useRecordClick({ refName, onOpen }) {
    const ref = useRef(refName);
    const handleClick = (ev) => {
        if (
            !ev.target.classList.contains("middle_clickable") &&
            EXCLUDED_TAGS.find((tag) => ev.target.closest(`${tag}`))
        ) {
            // keep the default browser behavior if the click on the element is not explicitly handled by the hook
            // e.g. <a> tag in an element middle clickable
            return;
        }
        const ctrlKey = (ev.ctrlKey && ev.button === 0) || ev.button === 1;
        if ([0, 1].includes(ev.button)) {
            onOpen(ev, ctrlKey);
            ev.preventDefault();
        }
    };
    useEffect(
        () => {
            if (ref.el) {
                console.log(ref.el);
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
