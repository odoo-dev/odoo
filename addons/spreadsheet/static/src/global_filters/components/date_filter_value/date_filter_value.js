import { Component, useState } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";

export class DateFilterValue extends Component {
    static template = "spreadsheet.DateFilterValue";
    static components = { Dropdown, DropdownItem };
    static props = {
        value: { optional: true },
        setValue: Function,
    };

    get options() {
        return [
            { id: "today", label: _t("Today") },
            { id: "yesterday", label: _t("Yesterday"), separator: true },
            { id: "this_week", label: _t("Last 7 days") },
            { id: "last_month", label: _t("Last 30 days") },
            { id: "last_quarter", label: _t("Last 90 days"), separator: true },
            { id: "month_to_date", label: _t("Month to date") },
            { id: "this_year", label: _t("Last month") },
            { id: "month", label: _t("Month"), separator: true, selector: true },
            { id: "last_year", label: _t("All time") },
        ];
    }

    get selectedOption() {
        return this.options.find((option) => option.id === this.props.value);
    }

    selectOption(option) {
        this.props.setValue(option.id);
    }
}
