/** @odoo-module **/

import { Component } from "@odoo/owl";

export class LocationSchedule extends Component {
    static template = "website_sale.locationSelector.schedule";
    static props = {
        openingHours: {
            type: Object,
            values: {
                type: Array,
                element: String,
                optional: true,
            },
        },
        wrapClass: { type: String, optional: true },
    };

    getWeekDay(weekday) {
        return luxon.Info.weekdays()[weekday]
    }
}
