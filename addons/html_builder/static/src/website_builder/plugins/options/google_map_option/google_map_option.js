import { useRef, onWillStart, onMounted, onWillDestroy } from "@odoo/owl";
import { BaseOptionComponent } from "@html_builder/core/utils";

/** @import { Place } from './google_map_option_plugin.js' */
/**
 * @typedef {Object} Props
 * @property {function(Element, boolean):Promise<void>} loadGoogleMaps
 * @property {function(Element, Place)} onPlaceChanged
 */

export class GoogleMapOption extends BaseOptionComponent {
    static template = "html_builder.GoogleMapOption";
    /** @type {Props} */
    static props = {
        loadGoogleMaps: { type: Function },
        onPlaceChanged: { type: Function },
    };

    async setup() {
        super.setup();
        /** @type {Props} */
        this.props;
        this.inputRef = useRef("inputRef");
        /** @type {Element} */
        this.editingElement = this.env.getEditingElement();
        onWillStart(async () => {
            await this.props.loadGoogleMaps(this.editingElement);
        });
        onMounted(() => {
            this.initializeAutocomplete(this.inputRef.el);
        });
        onWillDestroy(() => {
            if (this.autocompleteListener) {
                google.maps.event.removeListener(this.autocompleteListener);
            }
            // Without this, the Google library injects elements inside the
            // DOM but does not remove them once the option is closed.
            for (const container of document.body.querySelectorAll('.pac-container')) {
                container.remove();
            }
        });
    }

    /**
     * Initialize Google Places API's autocompletion on the option's input.
     *
     * @param {Element} inputEl
     */
    initializeAutocomplete(inputEl) {
        if (!this.googleMapsAutocomplete && window.google?.maps?.places) {
            this.googleMapsAutocomplete = new google.maps.places.Autocomplete(
                inputEl,
                { types: [ "geocode" ] },
            );
            this.autocompleteListener = google.maps.event.addListener(
                this.googleMapsAutocomplete,
                "place_changed",
                this.onPlaceChanged.bind(this),
            );
        }
    }

    /**
     * Retrieve the new place given by Google Places API's autocompletion
     * whenever it sends a signal that the place changed, and send it to the
     * plugin.
     */
    onPlaceChanged() {
        /** @type {Place | undefined} */
        const place = this.googleMapsAutocomplete.getPlace();
        this.props.onPlaceChanged(this.editingElement, place);
    }
}
