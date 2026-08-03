import { Component, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import {
    buildM2OFieldDescription,
    many2OneFieldProps,
} from "@web/views/fields/many2one/many2one_field";
import { computeM2OProps, Many2One } from "@web/views/fields/many2one/many2one";

export class Many2OneWorkEntryTypeField extends Component {
    static template = "hr_work_entry.Many2OneWorkEntryTypeField";
    static components = {
        Many2One,
    };
    // Extend by patching this class, not by mutating the list.
    static badgeFields = [
        { name: "display_code", type: "char" },
        { name: "color", type: "integer" },
    ];
    props = useProps(many2OneFieldProps);
    get m2oProps() {
        return {
            ...computeM2OProps(this.props),
            specification: Object.fromEntries(
                this.constructor.badgeFields.map(({ name }) => [name, {}])
            ),
        };
    }
}

export const many2OneWorkEntryTypeField = {
    ...buildM2OFieldDescription(Many2OneWorkEntryTypeField),
    // A function, so that a patch of badgeFields is taken into account.
    relatedFields: () => Many2OneWorkEntryTypeField.badgeFields,
};

registry.category("fields").add("many2one_work_entry_type", many2OneWorkEntryTypeField);
