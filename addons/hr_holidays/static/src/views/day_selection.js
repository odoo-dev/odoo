import { types as t, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { SelectionField, selectionField, selectionFieldProps } from "@web/views/fields/selection/selection_field";


export class DaySelectionField extends SelectionField {
    props = useProps({
        ...selectionFieldProps,
        month: t.string().optional(),
    }); 
    /**
     * @override
     */
    get options() {
        const options = super.options;
        const month = this.props.record.data[this.props.month];
        const max = new Date(2008, month, 0).getDate();
        return options.filter(([value]) => parseInt(value) <= max);
    }
} 

export const daySelectionField = {
    ...selectionField,
    component: DaySelectionField,
    extractProps(fieldInfo, dynamicInfo) {
        return {
            ...selectionField.extractProps(fieldInfo, dynamicInfo),
            month: fieldInfo.options.month,
        };
    },
};

registry.category("fields").add("day_selection", daySelectionField);
