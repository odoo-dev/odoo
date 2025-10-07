import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { computeM2OProps, Many2One } from "@web/views/fields/many2one/many2one";
import { buildM2OFieldDescription, Many2OneField } from "@web/views/fields/many2one/many2one_field";

/**
 * This widget `many2one_bank` are meant to be
 * used only with res.partner.bank
 */

export class Many2OneBankField extends Component {
    static template = "account.Many2OneBankField";
    static components = { Many2One };
    static props = { ...Many2OneField.props };

    get m2oProps() {
        return {
            ...computeM2OProps(this.props),
            specification: {
                allow_out_payment: {},
            },
        };
    }
}

export const many2OneBankField = {
    ...buildM2OFieldDescription(Many2OneBankField),
    relatedFields: [
        { name: "allow_out_payment", type: "bool" },
    ],
};

registry.category("fields").add("many2one_bank", many2OneBankField);
