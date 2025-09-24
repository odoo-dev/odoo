import { ActionSwiper } from "@web/core/action_swiper/action_swiper";
import { CalendarCommonRenderer } from "./calendar_common/calendar_common_renderer";
import { CalendarYearRenderer } from "./calendar_year/calendar_year_renderer";

import { Component, useState } from "@odoo/owl";

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
        this.state = useState({
            initialDate: this.props.model.date,
        });
    }
    get concreteRenderer() {
        return this.constructor.components[this.props.model.scale];
    }
    get concreteRendererProps() {
        if (this.props.model.scale === "year") {
            return {
                model: this.props.model,
                initialDate: this.state.initialDate,
                isWeekendVisible: this.props.isWeekendVisible,
                createRecord: this.props.createRecord,
                editRecord: this.props.editRecord,
                deleteRecord: this.props.deleteRecord,
            };
        }
        return {
            ...this.props,
            initialDate: this.state.initialDate,
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
        };
    }
    getSwiperProps(direction) {
        const targetDate = this.state.initialDate[direction === "next" ? "plus" : "minus"]({
            [`${this.props.model.scale}s`]: 1,
        });
        return {
            action: () => {
                this.state.initialDate = targetDate;
                this.props.setDate(direction);
            },
            slot: {
                component: this.concreteRenderer,
                props: {
                    ...this.concreteRendererProps,
                    initialDate: targetDate,
                },
            },
        };
    }
}
