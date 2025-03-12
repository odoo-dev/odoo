import { Component } from "@odoo/owl";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { useForwardRefToParent, useService } from "@web/core/utils/hooks";
import { addLoadingEffect } from "@web/core/utils/ui";
import { useSetupAction } from "@web/search/action_hook";
import { _t } from "@web/core/l10n/translation";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

export class Builder extends Component {
    static template = "html_builder.Builder";
    static props = {
        builder_sidebar: Function,
        canRedo: Boolean,
        canUndo: Boolean,
        closeEditor: Function,
        discard: Function,
        redo: Function,
        save: Function,
        slots: Object,
        undo: Function,
    };

    setup() {
        this.dialog = useService("dialog");
        this.builder_sidebarRef = useForwardRefToParent("builder_sidebar");
        useHotkey("control+z", () => this.undo());
        useHotkey("control+y", () => this.redo());
        useHotkey("control+shift+z", () => this.redo());
        useSetupAction({
            beforeUnload: (ev) => this.onBeforeUnload(ev),
            beforeLeave: () => this.onBeforeLeave(),
        });
    }

    discard() {
        if (this.props.canUndo) {
            this.dialog.add(ConfirmationDialog, {
                body: _t(
                    "If you discard the current edits, all unsaved changes will be lost. You can cancel to return to edit mode."
                ),
                confirm: () => this.props.discard(),
                cancel: () => {},
            });
        } else {
            this.props.discard();
        }
    }

    async onBeforeLeave() {
        if (this.props.canUndo) {
            let continueProcess = true;
            await new Promise((resolve) => {
                this.dialog.add(ConfirmationDialog, {
                    body: _t("If you proceed, your changes will be lost"),
                    confirmLabel: _t("Continue"),
                    confirm: () => resolve(),
                    cancel: () => {
                        continueProcess = false;
                        resolve();
                    },
                });
            });
            return continueProcess;
        }
        return true;
    }

    onBeforeUnload(ev) {
        if (!this.isSaving && this.props.canUndo) {
            ev.preventDefault();
            ev.returnValue = "Unsaved changes";
        }
    }

    redo() {
        this.props.redo();
    }

    async save() {
        this.isSaving = true;
        // TODO: handle the urgent save and the fail of the save operation
        const snippetMenuEl = this.builder_sidebarRef.el;
        // Add a loading effect on the save button and disable the other actions
        addLoadingEffect(snippetMenuEl.querySelector("[data-action='save']"));
        const actionButtonEls = snippetMenuEl.querySelectorAll("[data-action]");
        for (const actionButtonEl of actionButtonEls) {
            actionButtonEl.disabled = true;
        }
        await this.props.save();
        this.isSaving = false;
        this.props.closeEditor();
    }

    undo() {
        this.props.undo();
    }
}
