import { registry } from "@web/core/registry";
import { DateTimeField, dateTimeField } from "@web/views/fields/datetime/datetime_field";

export class DatetimePlaceholderField extends DateTimeField {
    static template = "sale.DatetimePlaceholderField";
}

export const datetimePlaceholderField = {
    ...dateTimeField,
    component: DatetimePlaceholderField,
};

registry.category("fields").add("datetime_placeholder_field", datetimePlaceholderField);
