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
    get concreteRenderer() {
        return this.constructor.components[this.props.model.scale];
    }
    get concreteRendererProps() {
        if (this.props.model.scale === "year") {
            return {
                model: this.props.model,
                initialDate: this.props.model.date,
                isWeekendVisible: this.props.isWeekendVisible,
                createRecord: this.props.createRecord,
                editRecord: this.props.editRecord,
                deleteRecord: this.props.deleteRecord,
            };
        }
        return {
            ...this.props,
            initialDate: this.props.model.date,
        };
    }
    get calendarKey() {
        return `${this.props.model.scale}_${this.props.model.date.valueOf()}`;
    }
    get actionSwiperProps() {
        return {
            onLeftSwipe: this.env.isSmall
                ? {
                      action: () => this.props.setDate("next"),
                      slot: {
                          component: this.concreteRenderer,
                          props: {
                              ...this.concreteRendererProps,
                              initialDate: this.props.model.date.plus({
                                  [`${this.props.model.scale}s`]: 1,
                              }),
                          },
                      },
                  }
                : undefined,
            onRightSwipe: this.env.isSmall
                ? {
                      action: () => this.props.setDate("previous"),
                      slot: {
                          component: this.concreteRenderer,
                          props: {
                              ...this.concreteRendererProps,
                              initialDate: this.props.model.date.minus({
                                  [`${this.props.model.scale}s`]: 1,
                              }),
                          },
                      },
                  }
                : undefined,
            animationType: "forwards",
        };
    }
}
