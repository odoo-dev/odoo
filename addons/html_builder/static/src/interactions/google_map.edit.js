import { GoogleMap } from "@website/snippets/s_google_map/google_map";
import { registry } from "@web/core/registry";

const GoogleMapsEdit = I => class extends I {
    setup() {
        super.setup();
        this.canSpecifyKey = true;
    }

    async willStart() {
        console.warn("willStart");
        this.canStart = await this.loadGoogleMaps();
    }

    start() {
        console.warn("start");
        super.start();
        if (this.canStart) {
            console.warn("dispatchEvent google_maps_loaded");
            window.parent.document.dispatchEvent(
                new CustomEvent("google_maps_loaded", {
                    detail: {
                        mapsAPI: google.maps,
                        placesAPI: google.maps.places,
                        editingElement: this.el,
                    },
                })
            );
        }
    }

    /**
     * Get the stored API key if any (or open a dialog to ask the user for one),
     * load and configure the Google Maps API.
     *
     * @param {boolean} [forceReconfigure=false]
     * @returns {Promise<void>}
     */
    async loadGoogleMaps(forceReconfigure = false) {
        console.warn("load google maps");
        /** @type {string | undefined} */
        const apiKey = await this.services.website_map.getGMapAPIKey(true);
        console.warn(apiKey);
        const apiKeyValidation = await this.services.website_map.validateGMapApiKey(apiKey);
        const shouldReconfigure = forceReconfigure || !apiKeyValidation.isValid;
        console.warn(shouldReconfigure, apiKeyValidation);
        if (shouldReconfigure) {
            console.warn("dispatchEvent google_maps_needs_configuration");
            window.parent.document.dispatchEvent(
                new CustomEvent("google_maps_needs_configuration", {
                    detail: { apiKey, editingElement: this.el },
                }),
            );
            return false;
        } else {
            // @TODO mysterious-egg: we don't wait here because sometimes the
            // promise never resolves. This is because it finds an API key and has
            // already called `loadJS` with it, `loadJS` will fetch the result from
            // cache and never actually call the Google API's URL, bypassing its
            // callback in the process, on which we depend to resolve the promise.
            return !!(await this.loadGoogleMapsAPIFromService(shouldReconfigure))
        }
    }

    /**
     * Load the Google Maps API from the Google Map Service.
     * This method is set apart so it can be overridden for testing.
     *
     * @param {boolean} [shouldRefetch]
     * @returns {Promise<string|undefined>} A promise that resolves to an API
     *                                      key if found.
     */
    async loadGoogleMapsAPIFromService(shouldRefetch) {
        console.warn("loadGoogleMapsAPIFromService");
        return this.services.website_map.loadGMapAPI(true, shouldRefetch);
    }
}

registry
    .category("public.interactions.edit")
    .add("html_builder.google_map", {
        Interaction: GoogleMap,
        mixin: GoogleMapsEdit,
    });
