import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { Component } from "@odoo/owl";

export class DaySelectionField extends Component {
    static template = "hr_holidays.DaySelectionField";
    static props = { ...standardFieldProps };

    setup() {
        console.log("apakah masuk sini");
    }

    get days() {
        // get selected yearly_month value
        const month = this.props.record.data.yearly_month;

        // set maxDays if months isn't selected
        let maxDays = 31;

        // set maxDays base on current year and selected month
        if (month) {
            const monthInt = parseInt(month);
            const year = new Date().getFullYear();
            maxDays = new Date(year, monthInt, 0).getDate();
        }
       
        // Convert integer to string
        let dayList = [];
        for (let i = 1; i <= maxDays; i++) {
            dayList.push(i.toString());
        }

        return dayList;
    }

    onChange(ev) { 
        const value = parseInt(ev.target.value);
        this.props.record.update({ [this.props.name]: value });
    }
}

export const daySelections = {
    component : DaySelectionField,
    supportedTypes: ["integer", "selection"],
    fieldDependencies: [{ name: "yearly_month", type: "selection" }],
}

registry.category("fields").add("day_selection", daySelections)