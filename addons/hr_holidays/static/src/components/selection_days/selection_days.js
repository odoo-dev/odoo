import { registry } from "@web/core/registry";
import { useProps } from "@odoo/owl";
import { SelectionField, selectionField, selectionFieldProps } from "@web/views/fields/selection/selection_field";

export class SelectionDays extends SelectionField {

    props = useProps({
        ...selectionFieldProps,
        monthField: String,
    });

    get options() {
        const monthField = this.props.monthField;
        const month = this.props.record.data[monthField];

        if (!monthField) {
            return Array.from({ length: 31 }, (_, i) => [String(i + 1), String(i + 1)]);
        }
        
        const days_in_month = new Date(2020, month, 0).getDate();

        const fieldList=[];
        for(let day =1; day <= days_in_month; day++){
            fieldList.push([String(day), String(day)]);
        }

        return fieldList;
    }
}

export const selection_days = {
    ...selectionField,
    component: SelectionDays,
    supportedTypes: ["char"],
    additionalClasses: ["o_field_selection"],
    extractProps: ({ attrs }) => ({
        monthField: attrs.month_field,
    }),
};

registry.category("fields").add("selection_days", selection_days);
