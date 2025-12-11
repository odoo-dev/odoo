/** CUSTOM DATE RANGE WITH PERIOD */
import { registry } from "@web/core/registry";
import { dateRangeField } from "@web/views/fields/datetime/datetime_field";

export class HrHolidaysDateRangeField extends dateRangeField.component {
    static template = "hr_holidays.HrHolidaysDateRangeField";

    static props = {
        ...dateRangeField.component.props,
        startPeriodField: { type: String, optional: true },
        endPeriodField: { type: String, optional: true },
    };

    setup() {
        super.setup();
    }

    get startPeriod() {
        return this.props.record.data[this.props.startPeriodField];
    }
    
    get endPeriod() {
        return this.props.record.data[this.props.endPeriodField];
    }

    onChangeStartPeriod(ev) {
        this.props.record.update({
            [this.props.startPeriodField]: ev.target.value,
        });
    }
    
    onChangeEndPeriod(ev) {
        this.props.record.update({
            [this.props.endPeriodField]: ev.target.value,
        });
    }
}

const START_PERIOD = "start_period_field";
const END_PERIOD = "end_period_field";

export const hrHolidaysDateRangeField = {
    ...dateRangeField,
    component: HrHolidaysDateRangeField,
    supportedOptions: [
        ...dateRangeField.supportedOptions,
        { name: START_PERIOD, type: "field" },
        { name: END_PERIOD, type: "field" },
    ],
    extractProps: ({ attrs, options, placeholder, type }, dynamicInfo) => {
        const base = dateRangeField.extractProps(
            { attrs, options, placeholder, type },
            dynamicInfo
        );

        return {
            ...base,
            startPeriodField: options[START_PERIOD],
            endPeriodField: options[END_PERIOD],
        };
    },
};


registry.category("fields").add("hr_holidays_daterange", hrHolidaysDateRangeField);


// import { registry } from "@web/core/registry";
// import { DateTimeField, dateRangeField } from "@web/views/fields/datetime/datetime_field";
// import { _t } from "@web/core/l10n/translation";
// import { useRef,useEffect,onWillUpdateProps } from "@odoo/owl";


// export class HrHolidaysDateTimeField extends DateTimeField {
//     static template = "hr_holidays.HrHolidaysDateTimeField";
//     // static component = {
//     //     // Record,
//     // }
    
//     static props = {
//         ...DateTimeField.props,
//         startPeriodField: { type: String, optional: true },
//         endPeriodField: { type: String, optional: true },
//     }
//     setup(){
//         super.setup()
//         // debugger;
//         console.log("props :", this.props)
//         // this.endPeriod = useRef("end-period")
//         // this.startPeriod = useRef("start-period")
//         // onWillUpdateProps(() => {
//         //     console.log("Updated Props ....");
//         // });

//     }
//     get endPeriodField(){
//         console.log("Gand",this.props.record.data.request_unit_half)

//         console.log("Helloowwwewe")
//         console.log(this.props.endPeriodField)
//         console.log(this.props.record.data.request_date_to_period || null)
//         return this.props.record.data.request_date_to_period || null;
//     }
    
//     shouldShowSeparator() {
//         return !this.isEmpty(this.endDateField) && super.shouldShowSeparator();
//     }
// }

// const START_PERIOD_FIELD_OPTION = "start_period_field";
// const END_PERIOD_FIELD_OPTION = "end_period_field";

// export const hrHolidaysDateRangeField = {
//     ...dateRangeField,
//     component: HrHolidaysDateTimeField,
//     supportedOptions: [
//         ...dateRangeField.supportedOptions,
//         {
//             label: _t("Start period field"),
//             name: START_PERIOD_FIELD_OPTION,
//             type: "selection",
//         },
//         {
//             label: _t("End period field"),
//             name: END_PERIOD_FIELD_OPTION,
//             type: "selection",
//         },
//     ],
//     extractProps: ({ attrs, options, placeholder, type }, dynamicInfo) => {
//         console.log("Hello World ...")
//         console.log(options)
//         return {
//             ...dateRangeField.extractProps({ attrs, options, placeholder, type }, dynamicInfo),
//             startPeriodField: options[START_PERIOD_FIELD_OPTION],
//             endPeriodField: options[END_PERIOD_FIELD_OPTION],
//         };
//     },
// };

// registry.category("fields").add("hr_holidays_daterange", hrHolidaysDateRangeField);