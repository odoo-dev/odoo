import { Component, onWillUpdateProps } from "@odoo/owl";
import {
    dateFilterValueToString,
    getDateRange,
    getNextDateFilterValue,
    getPreviousDateFilterValue,
    getDateFilterTypeLabel,
} from "@spreadsheet/global_filters/helpers";
import { DateTimeInput } from "@web/core/datetime/datetime_input";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
const { DateTime } = luxon;

const DATE_OPTIONS = [
    {
        id: "today",
        type: "relative",
        label: getDateFilterTypeLabel("today"),
    },
    {
        id: "yesterday",
        type: "relative",
        label: getDateFilterTypeLabel("yesterday"),
        separator: true,
    },
    {
        id: "last_7_days",
        type: "relative",
        label: getDateFilterTypeLabel("last_7_days"),
    },
    {
        id: "last_30_days",
        type: "relative",
        label: getDateFilterTypeLabel("last_30_days"),
    },
    {
        id: "last_90_days",
        type: "relative",
        label: getDateFilterTypeLabel("last_90_days"),
        separator: true,
    },
    {
        id: "month_to_date",
        type: "relative",
        label: getDateFilterTypeLabel("month_to_date"),
    },
    {
        id: "last_month",
        type: "relative",
        label: getDateFilterTypeLabel("last_month"),
    },
    {
        id: "month",
        type: "month",
        label: getDateFilterTypeLabel("month"),
    },
    {
        id: "quarter",
        type: "quarter",
        label: getDateFilterTypeLabel("quarter"),
        separator: true,
    },
    {
        id: "year_to_date",
        type: "relative",
        label: getDateFilterTypeLabel("year_to_date"),
    },
    {
        id: "last_12_months",
        type: "relative",
        label: getDateFilterTypeLabel("last_12_months"),
    },
    {
        id: "year",
        type: "year",
        label: getDateFilterTypeLabel("year"),
        separator: true,
    },
    {
        id: undefined,
        type: undefined,
        label: getDateFilterTypeLabel(undefined),
    },
    {
        id: "range",
        type: "range",
        label: getDateFilterTypeLabel("range"),
    },
];

/**
 * This component is used to select a date filter value.
 * It allows the user to select a month, quarter, year, or a custom date range.
 * It also provides options for relative periods like "last 7 days".
 */
export class DateFilterDropdown extends Component {
    static template = "spreadsheet.DateFilterDropdown";
    static components = { DropdownItem, DateTimeInput };
    static props = {
        value: { type: Object, optional: true },
        allowedFilterTypes: { type: Array, optional: true },
        update: Function,
    };

    setup() {
        this._computeDefaultSelectedValues();
        this._applyCurrentValueToSelectedValues(this.props.value);
        onWillUpdateProps((nextProps) => this._applyCurrentValueToSelectedValues(nextProps.value));
    }

    /**
     * Computes the default selected values based on the current date.
     */
    _computeDefaultSelectedValues() {
        const now = DateTime.local();
        this.selectedValues = {
            month: { month: now.month, year: now.year, type: "month" },
            quarter: { quarter: Math.ceil(now.month / 3), year: now.year, type: "quarter" },
            year: { year: now.year, type: "year" },
            range: { from: "", to: "", type: "range" },
        };
    }

    /**
     * Updates the default selected values based on the current value.
     * This method is called whenever the component's props are updated.
     */
    _applyCurrentValueToSelectedValues(value) {
        this._setRangeToCurrentValue(value);
        switch (value?.type) {
            case "month":
                this.selectedValues.month = {
                    type: "month",
                    month: value.month,
                    year: value.year,
                };
                break;
            case "quarter":
                this.selectedValues.quarter = {
                    type: "quarter",
                    quarter: value.quarter,
                    year: value.year,
                };
                break;
            case "year":
                this.selectedValues.year = { type: "year", year: value.year };
                break;
            case "range":
                this.selectedValues.range = {
                    type: "range",
                    from: value.from,
                    to: value.to,
                };
                break;
        }
    }

    _setRangeToCurrentValue(value) {
        const { from, to } = getDateRange(value);
        const now = DateTime.local();
        this.selectedValues.range = {
            type: "range",
            from: from ? from.toISODate() : now.startOf("month").toISODate(),
            to: to ? to.toISODate() : now.endOf("month").toISODate(),
        };
    }

    get dateOptions() {
        const options = DATE_OPTIONS;
        if (this.props.allowedFilterTypes) {
            return options.filter((option) => this.props.allowedFilterTypes.includes(option.id));
        }
        return options;
    }

    isMonthQuarterYear(value) {
        return ["month", "quarter", "year"].includes(value?.type);
    }

    isSelected(value) {
        if (!this.props.value) {
            return value.id === undefined;
        }
        if (this.props.value.type === "relative") {
            return this.props.value.period === value.id;
        }
        return this.props.value.type === value.type;
    }

    update(value) {
        switch (value.type) {
            case "relative":
                this.props.update({ type: "relative", period: value.id });
                break;
            case "month":
                this.props.update(this.selectedValues.month);
                break;
            case "quarter":
                this.props.update(this.selectedValues.quarter);
                break;
            case "year":
                this.props.update(this.selectedValues.year);
                break;
            case "range": {
                const { from, to } = this.selectedValues.range;
                if (from && to) {
                    // Ensure 'to' is after 'from'
                    if (DateTime.fromISO(from) > DateTime.fromISO(to)) {
                        this.selectedValues.range.to = from;
                        this.selectedValues.range.from = to;
                    }
                }
                this.props.update(this.selectedValues.range);
                break;
            }
            default:
                this.props.update(undefined);
        }
    }

    dateFrom() {
        return this.selectedValues.range.from
            ? DateTime.fromISO(this.selectedValues.range.from)
            : undefined;
    }

    dateTo() {
        return this.selectedValues.range.to
            ? DateTime.fromISO(this.selectedValues.range.to)
            : undefined;
    }

    setDateFrom(date) {
        this.selectedValues.range.from = date ? date.toISODate() : "";
        this.update(this.selectedValues.range);
    }
    setDateTo(date) {
        this.selectedValues.range.to = date ? date.toISODate() : "";
        this.update(this.selectedValues.range);
    }

    getDescription(type) {
        return dateFilterValueToString(this.selectedValues[type]);
    }

    selectPrevious(type) {
        this.selectedValues[type] = getPreviousDateFilterValue(this.selectedValues[type]);
    }

    selectNext(type) {
        this.selectedValues[type] = getNextDateFilterValue(this.selectedValues[type]);
    }
}
