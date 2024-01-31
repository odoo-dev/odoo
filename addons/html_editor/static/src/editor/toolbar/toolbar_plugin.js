/** @odoo-module */

import { reactive } from "@odoo/owl";
import { Plugin } from "../plugin";
import { Toolbar } from "./toolbar";
import { registry } from "@web/core/registry";
import { FontSelector } from "./font_selector";
import { isSelectionFormat } from "../utils/formatting";

const isFormatted = (format) => (el) => isSelectionFormat(el, format);
// TODO: This comes from a command registry?
const buttons = [
    {
        id: "font",
        name: "FontSelector",
        component: FontSelector,
        isFormatApplied: () => false, // TODO
    },
    {
        id: "bold",
        cmd: "FORMAT_BOLD",
        icon: "fa-bold",
        name: "Toggle bold",
        isFormatApplied: isFormatted("bold"),
    },
    {
        id: "italic",
        cmd: "FORMAT_ITALIC",
        icon: "fa-italic",
        name: "Toggle italic",
        isFormatApplied: isFormatted("italic"),
    },
    {
        id: "underline",
        cmd: "FORMAT_UNDERLINE",
        icon: "fa-underline",
        name: "Toggle underline",
        isFormatApplied: isFormatted("underline"),
    },
    {
        id: "strikethrough",
        cmd: "FORMAT_STRIKETHROUGH",
        icon: "fa-strikethrough",
        name: "Toggle strikethrough",
        isFormatApplied: isFormatted("strikeThrough"),
    },
    {
        id: "bulleted_list",
        cmd: "TOGGLE_LIST_UL",
        icon: "fa-list-ul",
        name: "Bulleted list",
        isFormatApplied: () => false, // TODO
    },
    {
        id: "numbered_list",
        cmd: "TOGGLE_LIST_OL",
        icon: "fa-list-ol",
        name: "Numbered list",
        isFormatApplied: () => false, // TODO
    },
    {
        id: "checklist",
        cmd: "TOGGLE_CHECKLIST",
        icon: "fa-check-square-o",
        name: "Checklist",
        isFormatApplied: () => false, // TODO
    },
];

export class ToolbarPlugin extends Plugin {
    static name = "toolbar";
    static dependencies = ["overlay"];

    setup() {
        this.buttons = buttons;
        this.buttonsActiveState = reactive(
            Object.fromEntries(this.buttons.map((b) => [b.id, false]))
        );
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
        const sel = window.getSelection();
        const range = sel.rangeCount ? sel.getRangeAt(0) : false;
        this.updateToolbarVisibility(range);
        if (this.overlay.isOpen) {
            this.updateButtonsActiveState();
        }
    }

    updateToolbarVisibility(range) {
        const inEditor = range && this.editable.contains(range.commonAncestorContainer);
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

    updateButtonsActiveState() {
        for (const button of this.buttons) {
            this.buttonsActiveState[button.id] = button.isFormatApplied(this.editable);
        }
    }
}

registry.category("phoenix_plugins").add(ToolbarPlugin.name, ToolbarPlugin);
