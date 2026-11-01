import { registry } from "@web/core/registry";

import { Component, useProps, t} from "@odoo/owl";
import { standardFieldProps } from "@web/views/fields/standard_field_props"
import { _t } from "@web/core/l10n/translation";

export class YearlyDayField extends Component {
    static template = "hr_holidays.YearlyDayField";

    props = useProps({
        ...standardFieldProps,
        monthField: t.string().optional(),
    });

    

    get day() {
        return this.props.record.data.yearly_day;
    }

    get month() {
        return this.props.record.data[this.props.monthField];
    }
    get listAvailableDays(){
        let result = [];
        const numOfDays = new Date(2020, this.month, 0).getDate();
        for (let i=1; i<=numOfDays; i++){
            result.push({value: i.toString(), label: i.toString()});
        }
        return result;
    }

    setup(){
    }

    async onDayChanged(record,ev){
        await record.update({yearly_day: ev.target.value})
    }

}

export const yearlyDayField = {
    component: YearlyDayField,
    displayName: _t("Yearly Day"),
    supportedTypes: ["selection"],
    extractProps({ options }) {
        return {
            monthField: options.month_field,
        };
    },
}

registry.category("fields").add("yearly_day_picker", yearlyDayField)
