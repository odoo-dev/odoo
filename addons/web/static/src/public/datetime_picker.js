import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import {
    deserializeDate,
    deserializeDateTime,
    parseDate,
    parseDateTime,
} from "@web/core/l10n/dates";

class DatetimePicker extends Interaction {
    static selector = "[data-widget='datetime-picker']";

    setup() {
        this.minDate = this.el.dataset.minDate;
        this.maxDate = this.el.dataset.maxDate;
        this.type = this.el.dataset.widgetType || "datetime";
        this.parseFunction = type === "date" ? parseDate : parseDateTime;
        this.deserializeFunction = type === "date" ? deserializeDate : deserializeDateTime;
    }

    start() {
        this.disableDateTimePicker = this.call("datetime_picker", "create", {
            target: this.el,
            pickerProps: {
                type: this.type,
                minDate: this.minDate && this.deserializeFunction(this.minDate),
                maxDate: this.maxDate && this.deserializeFunction(this.maxDate),
                value: this.parseFunction(this.el.value),
            },
        }).enable();
    }

    destroy() {
        this.disableDateTimePicker();
    }
}

registry
    .category("public.interactions")
    .add("web.datetime_picker", DatetimePicker);
