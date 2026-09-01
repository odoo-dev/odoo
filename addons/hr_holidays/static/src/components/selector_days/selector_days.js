import { useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { SelectionField, selectionField, selectionFieldProps } from "@web/views/fields/selection/selection_field";


export class SelectorDays extends SelectionField {

    props = useProps({
        ...selectionFieldProps,
        relatedMonth: String(),
    });

    get options() {
        const monthField = this.props.relatedMonth;
        const month = this.props.record.data[monthField];
        const month_days = new Date(2020, month, 0).getDate();
        return Array.from({ length: month_days }, (_, i) => {
            const day = String(i + 1);
            return [day, day];
        });
    }

}

export const selectorDays = {
    ...selectionField,
    supportedTypes: ["char"],
    component: SelectorDays,
    extractProps({ attrs }){
        return {
            relatedMonth: attrs.related_month,
        };
    },
};

registry.category("fields").add("selector_days", selectorDays);
