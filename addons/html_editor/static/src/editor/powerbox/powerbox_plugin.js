/** @odoo-module */

import { isEmpty } from "../utils/dom_info";
import { Plugin } from "../plugin";
import { Powerbox } from "./powerbox";
import { registry } from "@web/core/registry";

export class PowerboxPlugin extends Plugin {
    static name = "powerbox";
    static dependencies = ["overlay"];

    setup() {
        this.addDomListener(this.document, "selectionchange", this.handleCommandHint);
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
    }

    openPowerbox() {
        const selection = window.getSelection();
        const range = selection.rangeCount && selection.getRangeAt(0);
        this.offset = range && range.startOffset;
        this.powerbox.open();
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CONTENT_UPDATED":
                this.handleCommandHint();
                break;
        }
    }

    handleCommandHint() {
        const selection = window.getSelection();
        const range = selection.rangeCount && selection.getRangeAt(0);
        if (
            selection.isCollapsed &&
            range &&
            this.editable.contains(range.commonAncestorContainer)
        ) {
            const node = selection.anchorNode;
            const el = node instanceof Element ? node : node.parentElement;
            if ((el.tagName === "DIV" || el.tagName === "P") && isEmpty(el)) {
                this.dispatch("CREATE_HINT", {
                    el,
                    text: 'Type "/" for commands',
                });
            }
        }
    }
}

registry.category("phoenix_plugins").add(PowerboxPlugin.name, PowerboxPlugin);
