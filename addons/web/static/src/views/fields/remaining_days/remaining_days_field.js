/** @odoo-module **/

import { DatePicker, DateTimePicker } from "@web/core/datepicker/datepicker";
import { formatDate } from "@web/core/l10n/dates";
import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "../standard_field_props";

const { Component } = owl;

export class RemainingDaysField extends Component {
    get hasTime() {
        return this.props.type === "datetime";
    }

    get pickerComponent() {
        return this.hasTime ? DateTimePicker : DatePicker;
    }

    get diffDays() {
        if (!this.props.value) {
            return null;
        }
        const today = this.correctDate(luxon.DateTime.utc()).startOf("day");
        return Math.floor(
            this.correctDate(this.props.value).startOf("day").diff(today, "days").days
        );
    }

    get formattedValue() {
        return this.props.value ? formatDate(this.props.value, { timezone: this.hasTime }) : "";
    }

    correctDate(date) {
        return this.hasTime ? date.toLocal() : date.toUTC();
    }

    onDateTimeChanged(datetime) {
        if (datetime) {
            this.props.update(datetime);
        } else if (typeof datetime === "string") {
            // when the date is cleared
            this.props.update(false);
        }
    }
}

RemainingDaysField.template = "web.RemainingDaysField";
RemainingDaysField.props = {
    ...standardFieldProps,
};

RemainingDaysField.displayName = _lt("Remaining Days");
RemainingDaysField.supportedTypes = ["date", "datetime"];

registry.category("fields").add("remaining_days", RemainingDaysField);
