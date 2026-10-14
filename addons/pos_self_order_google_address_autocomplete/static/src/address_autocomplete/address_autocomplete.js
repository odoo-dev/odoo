import { Component, t, useProps } from "@odoo/owl";
import { AutoComplete } from "@web/core/autocomplete/autocomplete";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";

export class SelfOrderAddressInput extends Component {
    static template = "pos_self_order_google_address_autocomplete.SelfOrderAddressInput";
    static components = { AutoComplete };
    props = useProps({
        state: t.object(),
    });

    setup() {
        this.selfOrder = useService("self_order");
    }

    get sources() {
        return [
            {
                options: async (partialAddress) => {
                    if (partialAddress.length <= 5) {
                        return [];
                    }
                    const result = await rpc("/pos-self/autocomplete/address", {
                        access_token: this.selfOrder.access_token,
                        partial_address: partialAddress,
                    });
                    return (result.results || []).map((r) => ({
                        label: r.formatted_address,
                        onSelect: () => this.selectAddressProposition(r),
                    }));
                },
                optionSlot: "option",
                placeholder: _t("Searching for addresses..."),
            },
        ];
    }

    onChange({ inputValue, isOptionSelected }) {
        if (!isOptionSelected && inputValue !== this.props.state.street) {
            // The other fields belong to the previously selected address.
            Object.assign(this.props.state, {
                street: inputValue,
                city: "",
                zip: "",
                countryId: null,
                stateId: null,
                validationError: null,
            });
        }
    }

    async selectAddressProposition(option) {
        const address = await rpc("/pos-self/autocomplete/address_full", {
            access_token: this.selfOrder.access_token,
            address: option.formatted_address,
            google_place_id: option.google_place_id,
        });
        Object.assign(this.props.state, {
            street: option.formatted_address,
            city: address.city || "",
            zip: address.zip || "",
            countryId: address.country?.[0] || null,
            stateId: address.state?.[0] || null,
            validationError: null,
        });
    }
}

registry.category("pos_self_order.address_inputs").add("google_address_autocomplete", {
    Component: SelfOrderAddressInput,
    requiredFields: ["street", "city", "country_id", "zip"],
    isAvailable: (selfOrder) => selfOrder.config._has_google_places_api_key,
});
