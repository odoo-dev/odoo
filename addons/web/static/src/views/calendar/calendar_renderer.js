import { ActionSwiper } from "@web/core/action_swiper/action_swiper";
import { TOUCH_SELECTION_THRESHOLD } from "@web/views/utils";
import { CalendarCommonRenderer } from "./calendar_common/calendar_common_renderer";
import { CalendarYearRenderer } from "./calendar_year/calendar_year_renderer";


import { Component, useEffect } from "@odoo/owl";

export class CalendarRenderer extends Component {
    static template = "web.CalendarRenderer";
    static components = {
        day: CalendarCommonRenderer,
        week: CalendarCommonRenderer,
        month: CalendarCommonRenderer,
        year: CalendarYearRenderer,
        ActionSwiper,
    };
    static props = {
        model: Object,
        isWeekendVisible: Boolean,
        createRecord: Function,
        editRecord: Function,
        deleteRecord: Function,
        setDate: Function,
        callbackRecorder: Object,
        onSquareSelection: Function,
        cleanSquareSelection: Function,
    };
    setup() {
        this.surroundingCalendarData;
        this.fetchedSurroundingsPromise = this.fetchSurroundingData();
        useEffect((date) => {
            console.log("differente dATE")
            this.surroundingCalendarData = null;
            this.fetchedSurroundingsPromise = this.fetchSurroundingData(date);
        }, () => [this.props.model.date]);
    }
    get concreteRenderer() {
        return this.constructor.components[this.props.model.scale];
    }
    get concreteRendererProps() {
        if (this.props.model.scale === "year") {
            return {
                model: this.props.model,
                getCalendarData: () => this.getCalendarData(),
                initialDate: this.props.model.date,
                isWeekendVisible: this.props.isWeekendVisible,
                createRecord: this.props.createRecord,
                editRecord: this.props.editRecord,
                deleteRecord: this.props.deleteRecord,
            };
        }
        return {
            ...this.props,
            getCalendarData: () => this.getCalendarData(),
            initialDate: this.props.model.date,
        };
    }
    get calendarKey() {
        return `${this.props.model.scale}_${this.props.model.date.valueOf()}`;
    }
    get actionSwiperProps() {
        return {
            onLeftSwipe: this.getSwiperProps("next"),
            onRightSwipe: this.getSwiperProps("previous"),
            animationType: "forwards",
            enabledDuration: TOUCH_SELECTION_THRESHOLD
        };
    }
    async fetchSurroundingData() {
        let data = this.props.model.data;
        const _data = { ...data };
        
        console.log(data.range.start.toISO())
        await this.props.model.updateData(_data, {
            start: this.getSurroundingDate(data.range.start, "previous"),
            end: this.getSurroundingDate(data.range.end, "next"),
        });
        console.log("records around: ", _data.records)
        this.surroundingCalendarData = _data;
    }
    getSurroundingDate(date, direction) {
        return date[direction === "next" ? "plus" : "minus"]({[`${this.props.model.scale}s`]: 1});
    }
    async getCalendarData(direction) {
        if (direction) {
            if (this.surroundingCalendarData) {
                console.log("send befoire promise")
                return this.surroundingCalendarData;
            }
            await this.fetchedSurroundingsPromise;
            console.log("send after promise")
            return this.surroundingCalendarData;
        } else {
            return this.props.model.data;
        }
    }
    getSwiperProps(direction) {
        return {
            action: () => this.props.setDate(direction),
            slot: {
                component: this.concreteRenderer,
                props: {
                    ...this.concreteRendererProps,
                    getCalendarData: () => this.getCalendarData(direction),
                    initialDate: this.getSurroundingDate(this.props.model.date, direction),
                    isDisabled: true
                },
            },
        };
    }
}
