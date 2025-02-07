/** @odoo-module **/

import { registry } from "@web/core/registry";
import { formView } from "@web/views/form/form_view";
import { Record } from "@web/model/relational_model/record";
import { RelationalModel } from "@web/model/relational_model/relational_model";

class PaymentWizardRecord extends Record {
    async _update(changes, { withoutOnchange, withoutParentUpdate } = {}) {
        if ("amount" in changes) {
            changes["copy_active"] = false;
        }
        return super._update(...arguments);
    }
}

class PaymentWizardRelationalModel extends RelationalModel {}

PaymentWizardRelationalModel.Record = PaymentWizardRecord;

const paymentWizardFormView = {
    ...formView,
    Model: PaymentWizardRelationalModel,
};

registry.category("views").add("payment_wizard_form_view", paymentWizardFormView);
