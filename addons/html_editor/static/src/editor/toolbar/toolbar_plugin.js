/** @odoo-module */

import { Plugin } from "../plugin";
import { Toolbar } from "./toolbar";
import { reactive } from "@odoo/owl";

// TODO: This comes from a command registry?
const buttons = [
    {
        id: "bold",
        cmd: "TOGGLE_BOLD",
        icon: "fa-bold",
        name: "Toggle bold",
        isFormatApplied: hasTag("strong"),
    },
    {
        id: "italic",
        cmd: "TOGGLE_ITALIC",
        icon: "fa-italic",
        name: "Toggle italic",
        isFormatApplied: hasTag("em"),
    },
    {
        id: "underline",
        cmd: "TOGGLE_UNDERLINE",
        icon: "fa-underline",
        name: "Toggle underline",
        isFormatApplied: hasTag("u"),
    },
    {
        id: "strikethrough",
        cmd: "TOGGLE_STRIKETHROUGH",
        icon: "fa-strikethrough",
        name: "Toggle strikethrough",
        isFormatApplied: hasTag("s"),
    },
];

// TODO: This is a temporary naive solution to generate isFormatApplied callback.
function hasTag(tagName) {
    return (range) => {
        let el = range.startContainer;
        if (el.nodeType !== Node.ELEMENT_NODE) {
            el = el.parentElement;
        }
        return !!el.closest(tagName);
    };
}

export class ToolbarPlugin extends Plugin {
    static name = "toolbar";
    static dependencies = ["overlay"];

    setup() {
        this.buttons = buttons;
        this.buttonsActiveState = reactive(Object.fromEntries(this.buttons.map(b => [b.id, false])));
        /** @type {import("../core/overlay_plugin").Overlay} */
        this.overlay = this.shared.createOverlay(Toolbar, "top", {
            dispatch: this.dispatch,
            buttons: this.buttons,
            buttonsActiveState: this.buttonsActiveState,
        });
        this.addDomListener(document, "selectionchange", this.handleSelectionChange);
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CONTENT_UPDATED":
                if (this.overlay.isOpen) {
                    const range = getSelection().getRangeAt(0);
                    if (range.collapsed) {
                        this.overlay.close();
                    }
                }
                break;
        }
    }

    handleSelectionChange() {
        const range = window.getSelection().getRangeAt(0);
        this.updateToolbarVisibility(range);
        if (this.overlay.isOpen) {
            this.updateButtonsActiveState(range);
        }
    }

    updateToolbarVisibility(range) {
        const inEditor = this.editable.contains(range.commonAncestorContainer);
        if (this.overlay.isOpen) {
            if (!inEditor || range.collapsed) {
                this.overlay.close();
            } else {
                this.overlay.open(); // will update position
            }
        } else if (inEditor && !range.collapsed) {
            this.overlay.open();
        }
    }

    updateButtonsActiveState(range) {
        for (const button of this.buttons) {
            this.buttonsActiveState[button.id] = button.isFormatApplied(range);
        }
    }
}
