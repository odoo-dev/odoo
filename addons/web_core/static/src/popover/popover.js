import { Component, computed, props } from "@odoo/owl";

export class Popover extends Component {
    static template = "web_core.Popover";

    props = props({
        target: Function,
    });

    position = computed(() => {
        /** @type {HTMLElement | null} */
        const target = this.props.target();
        if (target?.isConnected) {
            const rect = target.getBoundingClientRect();
            return {
                top: rect.bottom,
                left: rect.left,
            };
        }
        return null;
    });

    style = computed(() => {
        const values = ["pointer-events: all"];
        const position = this.position();
        if (position) {
            values.push(`top: ${position.top}px`);
            values.push(`left: ${position.left}px`);
        }
        return values.join(";");
    });
}
