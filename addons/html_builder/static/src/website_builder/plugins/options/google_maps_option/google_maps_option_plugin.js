/* global google */

import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { renderToElement } from "@web/core/utils/render";
import { Plugin } from "@html_editor/plugin";
import { GoogleMapsApiKeyDialog } from "./google_maps_api_key_dialog";
import { GoogleMapsOption } from "./google_maps_option";

/**
 * A `google.maps.places.PlaceResult` object.
 * Here listed are only the few properties used here. For a full list, see:
 * {@link https://developers.google.com/maps/documentation/javascript/reference/places-service#PlaceResult}
 *
 * @typedef {Object} Place
 * @property {string} [formatted_address]
 * @property {Object} [geometry]
 * @property {Object} [geometry.location]
 * @property {function():number} geometry.location.lat
 * @property {function():number} geometry.location.lng
 */
/**
 * A string defining GPS coordinates in the form "`Latitude`,`Longitude`".
 * @typedef {`${number},${number}`} Coordinates
 */
/**
 * @typedef {{ isValid: boolean, message?: string }} ApiKeyValidation
 */

export class GoogleMapsOptionPlugin extends Plugin {
    static id = "googleMapsOption";
    static dependencies = ["history", "remove"];
    resources = {
        builder_options: [
            {
                OptionComponent: GoogleMapsOption,
                selector: ".s_google_map",
                props: {
                    getMapsAPI: this.getMapsAPI.bind(this),
                    getPlace: this.getPlace.bind(this),
                    onPlaceChanged: this.commitPlace.bind(this),
                },
            },
        ],
        builder_actions: this.getActions(),
        restore_savepoint_handlers: () => {
            // Restart interactions to re-render the map.
            this.dispatchTo("content_manually_updated_handlers");
        },
    };

    setup() {
        this.websiteService = this.services.website;
        this.dialog = this.services.dialog;
        this.orm = this.services.orm;
        this.notification = this.services.notification;

        /** @type {Map<Coordinates, Place>} */
        this.gpsMapCache = new Map();

        // RESET KEY FOR TESTING
        this.orm.write(
            "website",
            [ this.websiteService.currentWebsite.id ],
            { google_maps_api_key: "" },
        );

        window.parent.document.addEventListener(
            "google_maps_loaded",
            async ({ detail: { mapsAPI, placesAPI, editingElement } }) => {
                console.warn("hearing google_maps_loaded");
                this.mapsAPI = mapsAPI;
                this.placesAPI = placesAPI;
                // Try to fail early if there is a configuration issue.
                this.isGoogleMapsReady = !!(await this.getPlace(editingElement, editingElement.dataset.mapGps));
                console.warn("is loaded?", this.isGoogleMapsReady);
            },
        );
        window.parent.document.addEventListener(
            "google_maps_needs_configuration",
            async ({ detail: { apiKey, editingElement } }) => {
                console.warn("hearing google_maps_needs_configuration", apiKey);
                const didReconfigure = await this.configureGMapsAPI(apiKey);
                console.warn("didReconfigure =", didReconfigure);
                if (didReconfigure) {
                    // Restart interactions to retry loading.
                    console.warn("restart interactions!");
                    this.dispatchTo("content_manually_updated_handlers");
                } else {
                    this.dependencies.remove.removeElement(editingElement);
                }
            },
        );
    }

    getActions() {
        return {
            resetMapColor: {
                apply: ({ editingElement }) => {
                    editingElement.dataset.mapColor = "";
                },
            },
            showDescription: {
                isApplied: ({ editingElement }) => !!editingElement.querySelector(".description"),
                apply: ({ editingElement }) => {
                    editingElement.append(renderToElement("html_builder.GoogleMapsDescription"));
                },
                clean: ({ editingElement }) => {
                    editingElement.querySelector(".description").remove();
                },
            },
        };
    }

    getMapsAPI() {
        return this.mapsAPI;
    }

    /**
     * Take a set of coordinates and perform a search on them to return a
     * place's formatted address. If it failed, there must be an issue with the
     * API so remove the snippet.
     *
     * @param {Element} editingElement
     * @param {Coordinates} coordinates
     * @returns {Promise<Place | undefined>}
     */
    async getPlace(editingElement, coordinates) {
        const place = await this.nearbySearch(coordinates);
        if (place?.error && !this.isGoogleMapsErrorBeingHandled) {
            this.notifyGMapsError(editingElement);
        } else if (!place && !this.isGoogleMapsErrorBeingHandled) {
            // Somehow the search failed but Google didn't trigger an error.
            // @TODO mysterious-egg should we keep this? Seems radical. Not sure
            // we even ever get to this in the new flow.
            this.dependencies.remove.removeElement(editingElement);
        } else {
            return place;
        }
    }

    /**
     * Commit a place's coordinates and address to the cache and to the editing
     * element's dataset, then re-render the map to reflect it.
     *
     * @param {Element} editingElement
     * @param {Place} place
     */
    commitPlace(editingElement, place) {
        if (place?.geometry) {
            const location = place.geometry.location;
            /** @type {Coordinates} */
            const coordinates = `(${location.lat()},${location.lng()})`;
            this.gpsMapCache.set(coordinates, place);
            /** @type {{mapGps: Coordinates, pinAddress: string}} */
            const currentMapData = editingElement.dataset;
            const { mapGps, pinAddress } = currentMapData;
            if (mapGps !== coordinates || pinAddress !== place.formatted_address) {
                editingElement.dataset.mapGps = coordinates;
                editingElement.dataset.pinAddress = place.formatted_address;
                // Restart interactions to re-render the map.
                this.dispatchTo("content_manually_updated_handlers");
                this.dependencies.history.addStep();
            }
        }
    }

    /**
     * Test the validity of the API key provided if any. If none was provided,
     * or the key was invalid, or the `force` argument is `true`, open the API
     * key dialog to prompt the user to provide a new API key.
     *
     * @param {Object} param
     * @param {string} [param.apiKey]
     * @returns {Promise<boolean>} true if a new API key was written to db.
     */
    async configureGMapsAPI(apiKey) {
        console.warn("configure", apiKey);
        /** @type {number} */
        const websiteId = this.websiteService.currentWebsite.id;

        /** @type {boolean} */
        const didReconfigure = await new Promise(resolve => {
            let isInvalidated = false;
            // Open the Google API Key Dialog.
            this.dialog.add(GoogleMapsApiKeyDialog, {
                originalApiKey: apiKey,
                onSave: async newApiKey => {
                    await this.orm.write(
                        "website",
                        [ websiteId ],
                        { google_maps_api_key: newApiKey },
                    );
                    isInvalidated = true;
                },
            }, {
                onClose: () => resolve(isInvalidated),
            });
        });
        return didReconfigure;
    }

    /**
     * @param {Coordinates} coordinates
     * @returns {Promise<Place|{ error: string }|undefined>}
     */
    async nearbySearch(coordinates) {
        const place = this.gpsMapCache.get(coordinates);
        if (place) {
            return place;
        }

        const p = coordinates.substring(1).slice(0, -1).split(',');
        const location = new this.mapsAPI.LatLng(p[0] || 0, p[1] || 0);
        return new Promise(resolve => {
            const placesService = new this.placesAPI.PlacesService(document.createElement('div'));
            placesService.nearbySearch({
                // Do a 'nearbySearch' followed by 'getDetails' to avoid using
                // GMaps Geocoder which the user may not have enabled... but
                // ideally Geocoder should be used to get the exact location at
                // those coordinates and to limit billing query count.
                location,
                radius: 1,
            }, (results, status) => {
                const GMAPS_CRITICAL_ERRORS = [
                    this.placesAPI.PlacesServiceStatus.REQUEST_DENIED,
                    this.placesAPI.PlacesServiceStatus.UNKNOWN_ERROR
                ];
                if (status === this.placesAPI.PlacesServiceStatus.OK) {
                    placesService.getDetails({
                        placeId: results[0].place_id,
                        fields: ['geometry', 'formatted_address'],
                    }, (place, status) => {
                        if (status === this.placesAPI.PlacesServiceStatus.OK) {
                            this.gpsMapCache.set(coordinates, place);
                            resolve(place);
                        } else if (GMAPS_CRITICAL_ERRORS.includes(status)) {
                            resolve({ error: status });
                        } else {
                            resolve();
                        }
                    });
                } else if (GMAPS_CRITICAL_ERRORS.includes(status)) {
                    resolve({ error: status });
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Indicates to the user there is an error with the google map API and
     * re-opens the configuration dialog. For good measure, this also removes
     * the related snippet entirely as this is what is done in case of critical
     * error.
     *
     * @param {Element} editingElement
     */
    notifyGMapsError(editingElement) {
        // TODO this should be better to detect all errors. This is random.
        // When misconfigured (wrong APIs enabled), sometimes Google throws
        // errors immediately (which then reaches this code), sometimes it
        // throws them later (which then induces an error log in the console
        // and random behaviors).
        if (!this.isGoogleMapsErrorBeingHandled) {
            this.isGoogleMapsErrorBeingHandled = true;

            this.notification.add(
                _t("A Google Maps error occurred. Make sure to read the key configuration popup carefully."),
                { type: 'danger', sticky: true }
            );
            // Try again: invalidate the API key then restart interactions.
            console.warn("error => invalidate");
            this.orm.write(
                "website",
                [ this.websiteService.currentWebsite.id ],
                { google_maps_api_key: "" },
            ).then(() => {
                console.warn("done invalidating => restart");
                this.isGoogleMapsErrorBeingHandled = false;
                this.dispatchTo("content_manually_updated_handlers");
            });
        }
    }
}

registry.category("website-plugins").add(GoogleMapsOptionPlugin.id, GoogleMapsOptionPlugin);
