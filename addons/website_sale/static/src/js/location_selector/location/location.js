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
        number: Number,
        name: String,
        street: String,
        city: String,
        postalCode: String,
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

    /**
     * Get the city and the postal code.
     *
     * Return the city and the postal code using the sequence specific to the country.
     *
     * @return {Object} - The city and the postal code.
     */
    getCityAndPostalCode() {
        return this.props.postalCode + " " + this.props.city
    }
}
