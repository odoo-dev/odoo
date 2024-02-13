import { reactive } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { Toolbar } from "./toolbar";

export class ToolbarPlugin extends Plugin {
    static name = "toolbar";
    static dependencies = ["overlay", "selection"];
    static shared = ["getToolbarInfo"];

    setup() {
        this.buttonGroups = this.resources.toolbarGroup.sort((a, b) => a.sequence - b.sequence);
        this.buttonsActiveState = reactive(
            this.buttonGroups.flatMap((g) => g.buttons.map((b) => [b.id, false]))
        );
        /** @type {import("../core/overlay_plugin").Overlay} */
        this.overlay = this.shared.createOverlay(Toolbar, "top", {
            toolbar: this.getToolbarInfo(),
            floating: true,
        });
        this.addDomListener(this.document, "selectionchange", this.handleSelectionChange);
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CONTENT_UPDATED":
                if (this.overlay.isOpen) {
                    const range = this.document.getSelection().getRangeAt(0);
                    if (range.collapsed) {
                        this.overlay.close();
                    }
                }
                break;
        }
    }

    getToolbarInfo() {
        return {
            dispatch: this.dispatch,
            buttonGroups: this.buttonGroups,
            buttonsActiveState: this.buttonsActiveState,
            getSelection: () => this.shared.getEditableSelection(),
        };
    }

    handleSelectionChange() {
        const sel = this.shared.getEditableSelection();
        this.updateToolbarVisibility(sel);
        if (this.overlay.isOpen || this.config.disableFloatingToolbar) {
            this.updateButtonsActiveState();
        }
    }

    updateToolbarVisibility(sel) {
        if (this.config.disableFloatingToolbar) {
            return;
        }
        const inEditor = sel.inEditor;
        if (this.overlay.isOpen) {
            if (!inEditor || sel.isCollapsed) {
                this.overlay.close();
            } else {
                this.overlay.open(); // will update position
            }
        } else if (inEditor && !sel.isCollapsed) {
            this.overlay.open();
        }
    }

    updateButtonsActiveState() {
        const selection = this.shared.getEditableSelection();
        for (const buttonGroup of this.buttonGroups) {
            for (const button of buttonGroup.buttons) {
                this.buttonsActiveState[button.id] = button.isFormatApplied?.(
                    this.editable,
                    selection
                );
            }
        }
    }
}

registry.category("phoenix_plugins").add(ToolbarPlugin.name, ToolbarPlugin);
