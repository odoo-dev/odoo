/** @odoo-module **/

import { Component } from "@odoo/owl";
import { AutoCompleteWithPages } from "@website/components/autocomplete_with_pages/autocomplete_with_pages";

export class GpsAutoComplete extends Component {
    static template = "website.GpsAutoComplete";
    static components = { AutoCompleteWithPages };

    get sources() {
        return [
            {
                optionTemplate: "website.GpsAutoCompleteItem",
                options: async (term) => {
                    if (term.length < 2) {
                        return [];
                    }
                    try {
                        const result =
                            await this.props.contentWindow.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
                                {
                                    input: term,
                                    includedPrimaryTypes: ["geocode"],
                                }
                            );
                        const suggestions = result.suggestions || [];
                        return suggestions.map((suggestion) => ({
                            label: suggestion.placePrediction.text.toString(),
                            placePrediction: suggestion.placePrediction,
                        }));
                    } catch {
                        this.props.onError?.();
                        return [];
                    }
                },
            },
        ];
    }

    async onSelect(selectedOption, { input }) {
        const placePrediction = Object.getPrototypeOf(selectedOption).placePrediction;
        try {
            const placeResult = placePrediction.toPlace();
            await placeResult.fetchFields({
                fields: ["displayName", "formattedAddress", "location"],
            });
            const place = {
                place_id: placeResult.id,
                formatted_address: placeResult.formattedAddress || placeResult.displayName,
                geometry: {
                    location: {
                        lat: () => placeResult.location.lat(),
                        lng: () => placeResult.location.lng(),
                    },
                },
                name: placeResult.displayName,
            };
            const displayValue = place.formatted_address || placePrediction.text.toString();
            input.value = displayValue;
            this.props.targetDropdown.value = displayValue;
            this.props.onPlaceSelected?.(place);
        } catch {
            this.props.onError?.();
        }
    }

    onInput({ inputValue }) {
        this.props.targetDropdown.value = inputValue;
    }

    get dropdownClass() {
        const classList = [];
        for (const key in this.props?.classes) {
            classList.push(key, this.props.classes[key]);
        }
        return classList.join(" ");
    }
}

GpsAutoComplete.props = {
    classes: { type: Object },
    contentWindow: { type: Object },
    targetDropdown: { type: HTMLElement },
    onPlaceSelected: { type: Function, optional: true },
    onError: { type: Function, optional: true },
};
