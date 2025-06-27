import { ActionSwiper } from "@web/core/action_swiper/action_swiper";
import { CalendarCommonRenderer } from "./calendar_common/calendar_common_renderer";
import { CalendarYearRenderer } from "./calendar_year/calendar_year_renderer";

import { Component } from "@odoo/owl";

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
        this.LONG_TOUCH_THRESHOLD = 400;
    }
    get initialDate() {
        return this.props.model.date;
    }
    get concreteRenderer() {
        return this.constructor.components[this.props.model.scale];
    }
    get concreteRendererProps() {
        if (this.props.model.scale === "year") {
            return {
                model: this.props.model,
                initialDate: this.initialDate,
                isWeekendVisible: this.props.isWeekendVisible,
                createRecord: this.props.createRecord,
                editRecord: this.props.editRecord,
                deleteRecord: this.props.deleteRecord,
                longPressDelay: this.LONG_TOUCH_THRESHOLD
            };
        }
        return {
            ...this.props,
            initialDate: this.initialDate,
            longPressDelay: this.LONG_TOUCH_THRESHOLD
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
            enabledDuration: this.LONG_TOUCH_THRESHOLD
        };
    }
    getSwiperProps(direction) {
        const targetDate = this.initialDate[direction === "next" ? "plus" : "minus"]({
            [`${this.props.model.scale}s`]: 1,
        });
        return {
            action: () => this.props.setDate(direction),
            slot: {
                component: this.concreteRenderer,
                props: {
                    ...this.concreteRendererProps,
                    initialDate: targetDate,
                    isDisabled: true
                },
            },
        };
    }
}
