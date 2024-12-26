import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { KeepLast } from "@web/core/utils/concurrency";
import { renderToElement } from "@web/core/utils/render";
import { googlePlacesSession } from "@google_address_autocomplete/google_places_session";

export class AddressForm extends Interaction {
    static selector = ".oe_cart .checkout_autoformat";
    static selectorHas = "input[name='street'][data-autocomplete-enabled='1']";
    dynamicContent = {
        "input[name='street']": { "t-on-input.withTarget": this.debounced(this.onInputStreet, 200) },
        ".js_autocomplete_result": { "t-on-click": this.onClickAutocompleteResult },
    };

    setup() {
        this.streetAndNumberInput = this.el.querySelector("input[name='street']");
        this.cityInput = this.el.querySelector("input[name='city']");
        this.zipInput = this.el.querySelector("input[name='zip']");
        this.countrySelect = this.el.querySelector("select[name='country_id']");
        this.stateSelect = this.el.querySelector("select[name='state_id']");
        this.keepLast = new KeepLast();
    }

    onInputStreet(ev, inputEl) {
        const inputContainerEl = inputEl.parentNode;
        if (inputEl.value.length >= 5) {
            this.keepLast.add(
                googlePlacesSession.getAddressPropositions({
                    partial_address: inputEl.value,
                }).then((response) => {
                    inputContainerEl.querySelector(".dropdown-menu")?.remove();
                    inputContainerEl.appendChild(renderToElement("website_sale_autocomplete.AutocompleteDropDown", {
                        results: response.results,
                    }));
                })
            );
        } else {
            inputContainerEl.querySelector(".dropdown-menu")?.remove();
        }
    }

    async onClickAutocompleteResult(ev) {
        const dropdownEl = ev.currentTarget.parentNode;
        dropdownEl.innerText = "";
        dropdownEl.classList.add("d-flex", "justify-content-center", "align-items-center");

        const spinnerEl = document.createElement("div");
        spinnerEl.classList.add("spinner-border", "text-warning", "text-center", "m-auto");
        dropdownEl.appendChild(spinnerEl);

        const address = await this.waitFor(googlePlacesSession.getAddressDetails({
            address: ev.currentTarget.innerText,
            google_place_id: ev.currentTarget.dataset.googlePlaceId,
        }));

        if (address.formatted_street_number) {
            this.streetAndNumberInput.value = address.formatted_street_number;
        }
        // Text fields, empty if no value in order to avoid the user missing old data.
        this.zipInput.value = address.zip || "";
        this.cityInput.value = address.city || "";

        // Selects based on odoo ids
        if (address.country) {
            this.countrySelect.value = address.country[0];
            // Let the state select know that the country has changed so that it may fetch the correct states or disappear.
            this.countrySelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (address.state) {
            // Waits for the stateSelect to update before setting the state.
            new MutationObserver((entries, observer) => {
                this.stateSelect.value = address.state;
                observer.disconnect();
            }).observe(this.stateSelect, {
                childList: true, // Trigger only if the options change
            });
        }
        dropdownEl.remove();
    }
}

registry
    .category("public.interactions")
    .add("website_sale_autocomplete.address_form", AddressForm);
