/** @odoo-module **/

import { useActiveElement } from "@web/core/ui/ui_service";
import { useForwardRefToParent } from "@web/core/utils/hooks";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";

const { Component, onWillDestroy, useChildSubEnv, useState } = owl;

export class Dialog extends Component {
    setup() {
        this.modalRef = useForwardRefToParent("modalRef");
        useActiveElement("modalRef");
        this.data = useState(this.env.dialogData);
        useHotkey("escape", () => {
            this.data.close();
        });
        this.id = `dialog_${this.data.id}`;
        useChildSubEnv({ inDialog: true, dialogId: this.id });
        onWillDestroy(() => {
            if (this.env.isSmall) {
                this.data.scrollToOrigin();
            }
        });
    }

    get isFullscreen() {
        return this.props.fullscreen || this.env.isSmall;
    }
}
Dialog.template = "web.Dialog";
Dialog.props = {
    contentClass: { type: String, optional: true },
    footer: { type: Boolean, optional: true },
    fullscreen: { type: Boolean, optional: true },
    header: { type: Boolean, optional: true },
    modalRef: { type: Function, optional: true },
    size: { type: String, optional: true, validate: (s) => ["sm", "md", "lg", "xl"].includes(s) },
    slots: {
        type: Object,
        shape: {
            default: Object, // Content is not optional
            footer: { type: Object, optional: true },
        },
    },
    technical: { type: Boolean, optional: true },
    title: { type: String, optional: true },
};
Dialog.defaultProps = {
    contentClass: "",
    footer: true,
    fullscreen: false,
    header: true,
    size: "lg",
    technical: true,
    title: "Odoo",
};
