import { registry } from "@web/core/registry";
import { SelectionField } from "@web/views/fields/selection/selection_field";
import { useEffect } from "@odoo/owl";


export class DaySelector extends SelectionField {
    setup() {
        super.setup();
        
        useEffect(
            (monthValue) => {
                if (monthValue) {
                    const maxDay = this.getMaxDay(monthValue);
                    const currentDay = parseInt(this.props.record.data[this.props.name]);

                    if (currentDay > maxDay) {
                        this.props.record.update({ [this.props.name]: maxDay.toString() });
                    }
                }
            },
            () => [this.props.record.data[this.props.month]]
        );
    }

    getMaxDay(monthValue) {
        const year = new Date().getFullYear();
        return new Date(year, parseInt(monthValue), 0).getDate();
    }

    get options() {
        const monthValue = this.props.record.data[this.props.month];
        if (!monthValue) return [];

        const maxDay = this.getMaxDay(monthValue);
        return Array.from({ length: maxDay }, (_, i) => [(i + 1).toString(), (i + 1).toString()]);
    }
}

export const daySelector = {
    component: DaySelector,
    supportedTypes: ["selection"],
    extractProps: ({ attrs }) => ({
        month: attrs.month, 
    }),
};

registry.category("fields").add("day_selector", daySelector);
