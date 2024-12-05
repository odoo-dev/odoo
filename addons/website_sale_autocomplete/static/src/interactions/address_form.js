import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { rpc } from "@web/core/network/rpc";
import { KeepLast } from "@web/core/utils/concurrency";
import { renderToElement } from "@web/core/utils/render";

class AddressForm extends Interaction {
    static selector = ".oe_cart .checkout_autoformat:has(input[name='street'][data-autocomplete-enabled='1'])";
    dynamicContent = {
        "input[name='street']:t-on-input": () => this.debounced(this.onInputStreet, 200),
        ".js_autocomplete_result:t-on-click": this.onClickAutocompleteResult,
    }

    setup() {
        this.streetAndNumberInput = this.el.querySelector('input[name="street"]');
        this.cityInput = this.el.querySelector('input[name="city"]');
        this.zipInput = this.el.querySelector('input[name="zip"]');
        this.countrySelect = this.el.querySelector('select[name="country_id"]');
        this.stateSelect = this.el.querySelector('select[name="state_id"]');
        this.keepLast = new KeepLast();
        this.sessionId = this.generateUUID();
    }

    generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0, v = c == "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    hideAutocomplete(inputContainer) {
        const dropdown = inputContainer.querySelector('.dropdown-menu');
        if (dropdown) {
            dropdown.remove();
        }
    }

    onInputStreet(ev) {
        const inputContainer = ev.currentTarget.parentNode;
        if (ev.currentTarget.value.length >= 5) {
            this.keepLast.add(
                rpc('/autocomplete/address', {
                    partial_address: ev.currentTarget.value,
                    session_id: this.sessionId || null
                })).then((response) => {
                    this.hideAutocomplete(inputContainer);
                    inputContainer.appendChild(renderToElement("website_sale_autocomplete.AutocompleteDropDown", {
                        results: response.results
                    }));
                    if (response.session_id) {
                        this.sessionId = response.session_id;
                    }
                }
                );
        } else {
            this.hideAutocomplete(inputContainer);
        }
    }

    onClickAutocompleteResult(ev) {
        const dropDown = ev.currentTarget.parentNode;

        const spinner = document.createElement('div');
        dropDown.innerText = '';
        dropDown.classList.add('d-flex', 'justify-content-center', 'align-items-center');
        spinner.classList.add('spinner-border', 'text-warning', 'text-center', 'm-auto');
        dropDown.appendChild(spinner);

        rpc('/autocomplete/address_full', {
            address: ev.currentTarget.innerText,
            google_place_id: ev.currentTarget.dataset.googlePlaceId,
            session_id: this.sessionId || null
        }).then((address) => {
            if (address.formatted_street_number) {
                this.streetAndNumberInput.value = address.formatted_street_number;
            }
            // Text fields, empty if no value in order to avoid the user missing old data.
            this.zipInput.value = address.zip || '';
            this.cityInput.value = address.city || '';

            // Selects based on odoo ids
            if (address.country) {
                this.countrySelect.value = address.country;
                // Let the state select know that the country has changed so that it may fetch the correct states or disappear.
                this.countrySelect.dispatchEvent(new Event('change', { bubbles: true }));
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
            dropDown.remove();
        });
    }
}

registry
    .category("public.interactions")
    .add("website_sale_autocomplete.address_form", AddressForm);
