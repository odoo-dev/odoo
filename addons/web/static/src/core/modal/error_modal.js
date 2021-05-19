/** @odoo-module **/

import { browser } from "../browser/browser";
import { useModal } from "./modal_hook";
const { Component, hooks } = owl;
const { useState } = hooks;

export class ErrorModal extends Component {
    constructor() {
        super(...arguments);
        this.state = useState({
            showTraceback: false,
        });
        useModal({
            contentClass: "o_dialog_error",
            title: this.env._t("Odoo Error"),
        });
    }
    onClickClipboard() {
        browser.navigator.clipboard.writeText(
            `${this.props.name}\n${this.props.message}\n${this.props.traceback}`
        );
    }
}
ErrorModal.template = "web.ErrorModal";
