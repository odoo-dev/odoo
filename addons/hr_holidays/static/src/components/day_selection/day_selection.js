import { selectionField, SelectionField } from "@web/views/fields/selection/selection_field";
import { registry } from "@web/core/registry";

export class DaySelectionField extends SelectionField {
    static props = {
        ...SelectionField.props,
        month_field: {
            type: String,
            optional: true
        },
    }

    get options() {
        let month = parseInt(this.props.record.data[this.props.month_field]);
        if (month) {
            let days_number = new Date(2024, month, 0).getDate()
            let new_options = []
            for (let i = 0 ; i < days_number ; i++) new_options[i] = [i + 1, i + 1]
            return new_options
        }
        else {
            return super.options
        }
    }
}

export const daySelection = {
    ...selectionField,
    component: DaySelectionField,
    extractProps({ options }) {
        const props = selectionField.extractProps(...arguments);
        props.month_field = options["month_field"];
        return props;
    },
    fieldDependencies({ options }){
        if (options["month_field"]) {
            return [{
                "name": options["month_field"]
            }]
        }
    },
};

registry.category("fields").add("day_selection", daySelection);
