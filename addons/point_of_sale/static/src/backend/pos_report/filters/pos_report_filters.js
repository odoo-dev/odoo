import { Component, useState } from "@odoo/owl";
import { usePosReport } from "../pos_report_store";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { DateTimeInput } from "@web/core/datetime/datetime_input";
import { MultiRecordSelector } from "@web/core/record_selectors/multi_record_selector";
const { DateTime } = luxon;

export class PosReportFilters extends Component {
    static template = "point_of_sale.PosReportFilters";
    static components = { Dropdown, DropdownItem, DateTimeInput, MultiRecordSelector };

    setup() {
        this.store = usePosReport();

        const now = DateTime.now();
        this.dateFilter = useState({
            mode: "month",
            month: now.month,
            year: now.year,
            date_start: now.startOf("month"),
            date_stop: now.endOf("month"),
        });

        this.updateFilters();
    }

    get monthName() {
        return DateTime.local(this.dateFilter.year, this.dateFilter.month).toFormat("MMMM yyyy");
    }

    get hasDateFilter() {
        return this.store.filterSchema.some((f) => f.type === "date_range");
    }

    get multiSelector() {
        return this.store.filterSchema.filter((f) => f.type === "multi_select");
    }

    selectPreviousMonth() {
        const date = DateTime.local(this.dateFilter.year, this.dateFilter.month, 1).minus({
            months: 1,
        });
        this.dateFilter.month = date.month;
        this.dateFilter.year = date.year;
        this.dateFilter.date_start = date.startOf("month");
        this.dateFilter.date_stop = date.endOf("month");
        this.updateFilters();
    }

    selectNextMonth() {
        const date = DateTime.local(this.dateFilter.year, this.dateFilter.month, 1).plus({
            months: 1,
        });
        this.dateFilter.month = date.month;
        this.dateFilter.year = date.year;
        this.dateFilter.date_start = date.startOf("month");
        this.dateFilter.date_stop = date.endOf("month");
        this.updateFilters();
    }

    selectMode(mode) {
        this.dateFilter.mode = mode;
        this.updateFilters();
    }

    setDateFrom(date) {
        this.dateFilter.date_start = date;
        this.updateFilters();
    }

    setDateTo(date) {
        this.dateFilter.date_stop = date;
        this.updateFilters();
    }

    getMultiRecordSelectorProps(model, fieldName) {
        return {
            resModel: model,
            resIds: this.store.filters[fieldName] || [],
            update: (records) => {
                this.store.updateFilters({ [fieldName]: records.map((r) => r) });
            },
        };
    }

    updateFilters() {
        const { date_start, date_stop } = this.dateFilter;
        if (date_start && date_stop) {
            this.store.updateFilters({
                date_start: date_start.toFormat("yyyy-MM-dd HH:mm:ss"),
                date_stop: date_stop.toFormat("yyyy-MM-dd HH:mm:ss"),
            });
        }
    }
}
