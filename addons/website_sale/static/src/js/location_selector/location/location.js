/** @odoo-module **/

import { Component } from "@odoo/owl";
import {
    LocationSchedule
} from "@website_sale/js/location_selector/location_schedule/location_schedule";

export class Location extends Component {
    static components = { LocationSchedule };
    static template = "website_sale.locationSelector.location";
    static props = {
        id: String,
        name: String,
        address: String,
        number: Number,
        openingHours: {
            type: Object,
            values: {
                type: Array,
                element: String,
                optional: true,
            },
        },
        isSelected: Boolean,
        setSelectedLocation: Function,
    };
}
