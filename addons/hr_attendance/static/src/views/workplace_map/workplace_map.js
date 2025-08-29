/** @odoo-module **/
/*global L*/

import { registry } from "@web/core/registry";
import { Component, onMounted, onWillStart } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { rpc } from "@web/core/network/rpc";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { AssetsLoadingError, loadCSS, loadJS } from '@web/core/assets';

class WorkplaceMap extends Component {
    static template = "hr_attendance.WorkplaceMap";
    static props = {
        ...standardActionServiceProps,
    };
    setup() {
        this.leafletMap = null;
        this.marker = null;
        this.notification = useService("notification");

        onWillStart(async () => {
            try {
                await Promise.all([
                    loadJS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'),
                    loadJS('https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.js'),
                    loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'),
                    loadCSS('https://unpkg.com/leaflet-control-geocoder/dist/Control.Geocoder.css'),
                ])
            } catch (error) {
                if (!(error instanceof AssetsLoadingError)) {
                    throw error;
                }
            }
        });

        onMounted(
            () => {
                this.leafletMap = L.map("o_workplace_map").setView([20.5937, 78.9629], 5);
                this.leafletMap.attributionControl.setPrefix(
                    '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'
                );

                // Tiles
                L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
                }).addTo(this.leafletMap);

                this.leafletMap.on("click", (e) => {
                    if (this.marker) this.leafletMap.removeLayer(this.marker);
                    this.marker = L.marker(e.latlng).addTo(this.leafletMap);
                    this.saveCoords(e.latlng.lat, e.latlng.lng);
                });

                // Added Search bar
                if (L.Control.Geocoder) {
                    L.Control.geocoder({
                        defaultMarkGeocode: false
                    })
                    .on("markgeocode", (e) => {
                        const latlng = e.geocode.center;
                        if (this.marker) this.leafletMap.removeLayer(this.marker);
                        this.marker = L.marker(latlng).addTo(this.leafletMap);
                        this.leafletMap.setView(latlng, 15);
                        this.saveCoords(latlng.lat, latlng.lng);
                    })
                    .addTo(this.leafletMap);
                } else {
                    this.notification.add(_t("Leaflet Geocoder not loaded"), { type: "danger" });
                }
            }
        );
    }

    async saveCoords(lat, lng) {
        try {
            const company_id = this.props.action.context.allowed_company_ids?.[0];
            await rpc("/web/dataset/call_kw/res.company/write", {
                model: "res.company",
                method: "write",
                args: [[company_id], {
                    workplace_latitude: lat,
                    workplace_longitude: lng,
                    workplace_location: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
                }],
                kwargs: {},
            });

            this.notification.add(
                `Location saved! (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
                { type: "success" }
            );
        } catch (err) {
            this.notification.add(_t("Failed to save location") + err, { type: "danger" });
        }
    }
}

registry.category("actions").add("open_workplace_location_map", WorkplaceMap);
