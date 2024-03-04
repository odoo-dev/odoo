/** @odoo-module **/

import { Component, onWillStart, useEffect, useState } from "@odoo/owl";
import { AssetsLoadingError, loadCSS, loadJS } from "@web/core/assets";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { LocationList } from "@website_sale/js/location_selector/location_list/location_list";
import { Map } from "@website_sale/js/location_selector/map/map";

export class LocationSelectorDialog extends Component {
    static components = { Dialog, LocationList, Map };
    static template = 'website_sale.locationSelector.dialog';
    static props = {
        carrierId: Number,
        zipCode: String,
        save: Function,
        selectedLocationId: { type: [String, {value: false}], optional: true},
        close: Function, // This is the close from the env of the Dialog Component
    };
    static defaultProps = {
        selectedLocationId: false,
    };

    setup() {
        this.title = _t("Choose a pick-up point");
        this.state = useState({
            locations: [],
            error: false,
            viewMode: "map",
            zipCode: this.props.zipCode,
            selectedLocationId: String(this.props.selectedLocationId),
            loadMap: false,
        });

        useEffect(
            () => {
                this.state.locations = []
                this._updateLocations(this.state.zipCode)
            },
            () => [this.state.zipCode]
        );

        onWillStart(
            async () => {
                // We load the script for the map before rendering the owl component to avoid a
                // UserError if the script can be loaded (e.g. if the customer lost connection
                // between the rendering of the page and when he opens the location selector).
                try {
                    await Promise.all([
                        loadJS("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"),
                        loadCSS("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"),
                    ])
                    this.state.loadMap = true;
                } catch (error) {
                    if (!(error instanceof AssetsLoadingError)) {
                        throw error;
                    }
                }
            }
        );
    }

    //--------------------------------------------------------------------------
    // Data Exchanges
    //--------------------------------------------------------------------------

    async _getLocations(zip) {
        return rpc('/shop/access_point/close_locations', {
            carrier_id: this.props.carrierId,
            zip_code: zip,
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Get the locations based on the zip code.
     *
     * Select the first location available if no location is currently selected or if the currently
     * selected location is not on the list anymore.
     *
     * @param {String} zip - The postal code used to look for close locations.
     */
    async _updateLocations(zip) {
        this.state.error = false;
        const { locations, error } = await this._getLocations(zip);
        if (error) {
            this.state.error = error;
        } else {
            this.state.locations = locations;
            if (!this.state.locations.find(l => String(l.id) === this.state.selectedLocationId)) {
                this.state.selectedLocationId = this.state.locations[0]?.id || false;
            };
        }
    }

    /**
     * Set the selectedLocationId in the state.
     *
     * @param {String} locationId
     */
    setSelectedLocation(locationId) {
        this.state.selectedLocationId = String(locationId);
    }

    /**
     * Confirm the current selected location.
     *
     * @return {undefined}
     */
    async validateSelection() {
        if (!this.state.selectedLocationId) return;
        const loc = this.state.locations.find(
            l => String(l.id) === this.state.selectedLocationId
        );
        await this.props.save(this.props.carrierId, loc);
        this.props.close();
    }

    get mobileComponent() {
        if (this.state.viewMode !== "list" && this.state.loadMap) return Map;
        return LocationList;
    }
}
