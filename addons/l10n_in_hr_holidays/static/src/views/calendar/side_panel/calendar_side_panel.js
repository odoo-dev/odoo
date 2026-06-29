import { patch } from "@web/core/utils/patch";
import { TimeOffCalendarSidePanel } from "@hr_holidays/views/calendar/calendar_side_panel/calendar_side_panel";

patch(TimeOffCalendarSidePanel.prototype, {
    async getSpecialDays() {
        const superSpecialDays = await super.getSpecialDays();
        const { rangeStart, rangeEnd } = this.props.model;
        const specialDays = await this._specialDaysCache.read(rangeStart, rangeEnd);
        specialDays["optionalHolidays"].forEach((optionalHoliday) => {
            optionalHoliday.start = luxon.DateTime.fromISO(optionalHoliday.start);
            optionalHoliday.end = luxon.DateTime.fromISO(optionalHoliday.end);
        });
        return {
            ...superSpecialDays,
            optionalHolidays: specialDays.optionalHolidays
        };
    },

    get leaveState() {
        return {
            ...super.leaveState,
            optionalHolidays: this.specialDays()?.optionalHolidays || [],
        };
    },
});
