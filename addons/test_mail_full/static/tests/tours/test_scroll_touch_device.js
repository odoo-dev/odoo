import { queryFirst } from "@odoo/hoot-dom";
import { registry } from "@web/core/registry";

function dispatchEvent(param0, evName, events) {
    const ev = new TouchEvent(evName);
    const el = typeof param0 === "string" ? queryFirst(param0) : param0;
    events.set(ev, el);
    el.dispatchEvent(ev);
}

registry.category("web_tour.tours").add("test_scroll_touch_device", {
    steps: () => [
        {
            trigger: "#chatterRoot:shadow .o-mail-Message",
            run: async () => {
                const events = new Map();
                // for (const evName of ["touchmove", "scroll", "click", "mousedown", "mousemove"]) {
                for (const evName of ["touchmove"]) {
                    dispatchEvent(document.body, evName, events);
                    dispatchEvent("#chatterRoot:shadow .o-mail-Message", evName, events);
                    dispatchEvent("#chatterRoot:shadow .o-mail-Thread", evName, events);
                }
                await new Promise(setTimeout); // await bubble phase ends
                for (const ev of events.keys()) {
                    if (ev.defaultPrevented) {
                        console.warn(
                            `"${ev.type}" is prevented when it shouldn't. Please check any greedy ev.preventDefault()`
                        );
                        console.warn(events.get(ev));
                        throw new Error(
                            `"${ev.type}" is prevented when it shouldn't. Please check any greedy ev.preventDefault()`
                        );
                    }
                }
            },
        },
    ],
});
