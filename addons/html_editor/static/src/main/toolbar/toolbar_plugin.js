import { Plugin } from "@html_editor/plugin";
import { reactive } from "@odoo/owl";
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
                    const sel = this.shared.getEditableSelection();
                    if (sel.isCollapsed) {
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

    handleSelectionChange(selection) {
        this.updateToolbarVisibility(selection);
        if (this.overlay.isOpen || this.config.disableFloatingToolbar) {
            this.updateButtonsActiveState(selection);
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
                const selection = this.document.getSelection();
                const preventClosing = selection?.anchorNode?.closest?.(
                    "[data-prevent-closing-overlay]"
                );
                if (preventClosing?.dataset?.preventClosingOverlay === "true") {
                    return;
                }
                this.overlay.close();
            } else {
                this.overlay.open({ props }); // will update position
            }
        } else if (inEditable && !sel.isCollapsed) {
            this.overlay.open({ props });
        }
    }

    updateButtonsActiveState(selection) {
        if (selection.inEditable) {
            for (const buttonGroup of this.buttonGroups) {
                for (const button of buttonGroup.buttons) {
                    this.buttonsActiveState[button.id] = button.isFormatApplied?.(selection);
                }
            }
        }
    }
}
