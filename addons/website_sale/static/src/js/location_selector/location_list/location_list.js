/** @odoo-module **/

import { Component, onMounted, useEffect } from "@odoo/owl";
import { Location } from "@website_sale/js/location_selector/location/location";

export class LocationList extends Component {
    static components = { Location };
    static template = "website_sale.locationSelector.locationList";
    static props = {
        locations: Array, // TODO VCR
        selectedLocationId: [String, {value: false}],
        setSelectedLocation: Function,
        validateSelection: Function,
    };

    setup() {
        onMounted(() => {
            document.getElementById("location-"+this.props.selectedLocationId).focus();
        });
        useEffect(
            (locations, selectedLocationId) => {
                const selectedLocation = locations.find(
                    l => String(l.id) === selectedLocationId
                );
                if (selectedLocation) {
                    document.getElementById("location-"+selectedLocation.id).focus();
                }
            },
            () => [this.props.locations, this.props.selectedLocationId]
        );
    }

}
