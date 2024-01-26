/** @odoo-module */

import { isEmpty } from "../utils/dom_info";
import { Plugin } from "../plugin";
import { Powerbox } from "./powerbox";
import { registry } from "@web/core/registry";

export class PowerboxPlugin extends Plugin {
    static name = "powerbox";
    static dependencies = ["overlay"];

    setup() {
        this.offset = 0;

        /** @type {import("../core/overlay_plugin").Overlay} */
        this.powerbox = this.shared.createOverlay(Powerbox, "bottom", {
            dispatch: this.dispatch,
            el: this.editable,
            offset: () => this.offset,
        });
        this.addDomListener(this.editable, "keypress", (ev) => {
            if (ev.key === "/") {
                this.openPowerbox();
            }
        });
        this.registry.category("temp_hints").add("powerbox", {
            text: 'Type "/" for commands',
            target(selection) {
                const node = selection.anchorNode;
                const el = node instanceof Element ? node : node.parentElement;
                return (el.tagName === "DIV" || el.tagName === "P") && isEmpty(el) && el;
            },
        });
    }

    openPowerbox() {
        const selection = window.getSelection();
        const range = selection.rangeCount && selection.getRangeAt(0);
        this.offset = range && range.startOffset;
        this.powerbox.open();
    }
}

registry.category("phoenix_plugins").add(PowerboxPlugin.name, PowerboxPlugin);
