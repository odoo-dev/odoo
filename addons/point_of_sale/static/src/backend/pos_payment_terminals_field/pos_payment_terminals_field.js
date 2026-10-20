import { registry } from "@web/core/registry";
import { X2ManyField, x2ManyField } from "@web/views/fields/x2many/x2many_field";

// TODO-manv: easier way to do this?
// Open a terminal view in a popup instead of leaving the payment method form
export class PosPaymentTerminalsField extends X2ManyField {
    async switchToForm(record) {
        return this._openRecord({
            record,
            context: this.props.context,
            readonly: this.props.readonly,
        });
    }
}

export const posPaymentTerminalsField = {
    ...x2ManyField,
    component: PosPaymentTerminalsField,
};

registry.category("fields").add("pos_payment_terminals", posPaymentTerminalsField);
