import { onWillRender } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { radioField, RadioField } from "@web/views/fields/radio/radio_field";

export class CalendarRadioField extends RadioField {
    static template = "web.CalendarRadioField";

    setup() {
        super.setup();
        this.counters = {};
        onWillRender(() => {
            if (this.env.calendarModel.aggregate) {
                this.counters = this.env.calendarModel.computeAggregatedValues(this.props.name);
            }
        });
    }
}

export const calendarRadioField = {
    ...radioField,
    component: CalendarRadioField,
};

registry.category("fields").add("calendar_radio", calendarRadioField);
