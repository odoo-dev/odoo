import { registry } from "@web/core/registry";
import { SelectionField } from "@web/views/fields/selection/selection_field";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class AccrualDayField extends SelectionField {

    static props = {
        ...standardFieldProps,
        monthField: {
            type: String,
        }
    }

    get options() {
        let options = super.options;
        const carryover_month = this.props.record.data[this.props.monthField];
        const lastDay = new Date(2020, carryover_month, 0).getDate();
        options = options.filter((option) => option[0] <= lastDay);
        return options;
    }
}

registry.category("fields").add("accrual_day", {
    component: AccrualDayField,
    extractProps: ({ attrs }) => ({
        monthField: attrs.monthField
    })
});
