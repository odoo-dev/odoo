import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { computeM2OProps, Many2One } from "@web/views/fields/many2one/many2one";
import { buildM2OFieldDescription, Many2OneField } from "@web/views/fields/many2one/many2one_field";

export class Many2OneUomField extends Component {
    static template = "uom.Many2OneUomField";
    static components = { Many2One };
    static props = { ...Many2OneField.props };

    get m2oProps() {
        return {
            ...computeM2OProps(this.props),
            specification: {
                name: {},
                relative_factor: {},
                relative_uom_id: {
                    fields: {
                        display_name: {},
                    },
                },
            },
        };
    }

    getLabel(record) {
        return record.name ? record.name.split("\n")[0] : _t("Unnamed");
    }
}

registry.category("fields").add("many2one_uom", {
    ...buildM2OFieldDescription(Many2OneUomField),
    additionalClasses: ["o_field_many2one"],
});
