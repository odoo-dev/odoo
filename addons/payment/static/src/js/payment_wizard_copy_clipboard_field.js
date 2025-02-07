/** @odoo-module **/

import { useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useBus } from "@web/core/utils/hooks";
import {
    copyClipboardButtonField,
    CopyClipboardButtonField,
} from "@web/views/fields/copy_clipboard/copy_clipboard_field";

class PaymentWizardCopyClipboardButtonField extends CopyClipboardButtonField {
    setup() {
        super.setup();
        this.state = useState({ disabled: false });
        useBus(this.props.record.model.bus, "FIELD_IS_DIRTY", (ev) => {
            this.state.disabled = ev.detail;
        });
    }

    get disabled() {
        if (this.state.disabled) {
            return true;
        }
        return super.disabled;
    }
}

export const paymentWizardCopyClipboardButtonField = {
    ...copyClipboardButtonField,
    component: PaymentWizardCopyClipboardButtonField,
};

registry
    .category("fields")
    .add("PaymentWizardCopyClipboardButtonField", paymentWizardCopyClipboardButtonField);
