/** @odoo-module */

import { AbstractAwaitablePopup } from "@point_of_sale/app/popup/abstract_awaitable_popup";
import { _lt } from "@web/core/l10n/translation";
import { onMounted, useRef, useState } from "@odoo/owl";

// formerly TextInputPopupWidget
export class TextInputPopup extends AbstractAwaitablePopup {
    static template = "TextInputPopup";
    static defaultProps = {
        confirmText: _t("Confirm"),
        cancelText: _t("Discard"),
        confirmKey: "Enter",
        title: "",
        body: "",
        startingValue: "",
        placeholder: "",
    };

    setup() {
        super.setup();
        this.state = useState({ inputValue: this.props.startingValue });
        this.inputRef = useRef("input");
        onMounted(this.onMounted);
    }
    _onWindowKeyup(event) {
        if (event.key === this.props.confirmKey) {
            this.confirm();
        } else {
            super._onWindowKeyup(...arguments);
        }
    }
    onMounted() {
        this.inputRef.el.focus();
    }
    getPayload() {
        return this.state.inputValue;
    }
}
