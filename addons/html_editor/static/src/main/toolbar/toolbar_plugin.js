import { reactive } from "@odoo/owl";
import { Plugin } from "@html_editor/plugin";
import { Toolbar } from "./toolbar";

export class ToolbarPlugin extends Plugin {
    static name = "toolbar";
    static dependencies = ["overlay", "selection"];
    static shared = ["getToolbarInfo"];
    /** @type { (p: ToolbarPlugin) => Record<string, any> } */
    static resources = (p) => ({
        onSelectionChange: p.handleSelectionChange.bind(p),
    });

    setup() {
        this.buttonGroups = this.resources.toolbarGroup.sort((a, b) => a.sequence - b.sequence);
        this.buttonsActiveState = reactive(
            this.buttonGroups.flatMap((g) => g.buttons.map((b) => [b.id, false]))
        );
        this.overlay = this.shared.createOverlay(Toolbar, { position: "top-start" });
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
        const props = { toolbar: this.getToolbarInfo() };

        const inEditable = sel.inEditable;
        if (this.overlay.isOpen) {
            if (!inEditable || sel.isCollapsed) {
                this.overlay.close();
            } else {
                this.overlay.open({ props }); // will update position
            }
        } else if (inEditable && !sel.isCollapsed) {
            this.overlay.open({ props });
        }
    }

    updateButtonsActiveState() {
        const selection = this.shared.getEditableSelection();
        if (selection.inEditable) {
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
}
