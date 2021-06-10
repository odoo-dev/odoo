/** @odoo-module **/

import { useHotkey } from "../hotkey_hook";
import { useService } from "../service_hook";
import { useActiveElement } from "../ui/ui_service";

const { Component, hooks } = owl;
const { useRef, useSubEnv } = hooks;

export class Dialog extends Component {
    setup() {
        if (this.constructor === Dialog) {
            throw new Error(
                "Dialog should not be used by itself. Please use the dialog service with a Dialog subclass."
            );
        }
        this.modalRef = useRef("modal");
        this.dialogService = useService("dialog");
        useActiveElement("modal");
        useHotkey(
            "escape",
            () => {
                this.close();
            },
            { altIsOptional: true }
        );
        useSubEnv({ inDialog: true });
        this.close = this.close.bind(this);
        this.contentClass = this.constructor.contentClass;
        this.fullscreen = this.constructor.fullscreen;
        this.renderFooter = this.constructor.renderFooter;
        this.renderHeader = this.constructor.renderHeader;
        this.size = this.constructor.size;
        this.technical = this.constructor.technical;
        this.title = this.constructor.title;
        this.__id = null;
    }

    /**
     * Send an event signaling that the dialog should be closed.
     * @private
     */
    close() {
        this.dialogService.close(this.__id);
    }
}

Dialog.template = "web.Dialog";
Dialog.contentClass = null;
Dialog.fullscreen = false;
Dialog.renderFooter = true;
Dialog.renderHeader = true;
Dialog.size = "modal-lg";
Dialog.technical = true;
Dialog.title = "Odoo";
Dialog.bodyTemplate = owl.tags.xml`<div/>`;
Dialog.footerTemplate = "web.DialogFooterDefault";
