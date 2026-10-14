import { Component, EventBus, t, useProps } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { AddressAutoComplete } from "@google_address_autocomplete/address_autocomplete/google_address_autocomplete";

class SelfOrderAddressAutoComplete extends AddressAutoComplete {
    setup() {
        super.setup();
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

    async selectAddressProposition(option) {
        const address = await rpc("/pos-self/autocomplete/address_full", {
            access_token: this.selfOrder.access_token,
            address: option.formatted_address,
            google_place_id: option.google_place_id,
        });
        const fieldToDetail = {
            street: "formatted_street_number",
            country_id: "country",
            state_id: "state",
        };
        const fieldsToUpdate = [
            "street",
            "street2",
            "city",
            "state_id",
            "zip",
            "country_id",
            "city_id",
        ];
        const activeFields = this.props.record.activeFields;
        const fields = this.props.record.fields;
        const addressFieldMap = this.props.addressFieldMap;
        const valuesToUpdate = {};
        const rest = [];
        fieldsToUpdate.forEach((fieldName) => {
            const addressField = fieldToDetail[fieldName] || fieldName;
            let value = address[addressField];
            const recordFieldName = addressFieldMap[fieldName] || fieldName;
            if (recordFieldName in activeFields) {
                if (fields[recordFieldName].type === "many2one") {
                    value = value && { id: value[0], display_name: value[1] };
                } else if (Array.isArray(value)) {
                    value = value[1];
                }
                valuesToUpdate[recordFieldName] = value || false;
            } else if (!(recordFieldName in fields) && value) {
                value = Array.isArray(value) ? value[1] : value;
                rest.push(value);
            }
        });
        if (!(this.props.name in valuesToUpdate) && rest.length) {
            valuesToUpdate[this.props.name] = rest.join(" ");
        }
        this.props.record.update(valuesToUpdate);
        await this.props.record.update({ [this.props.name]: option.formatted_address });
    }
}

export class SelfOrderAddressInput extends Component {
    static template = "pos_self_order_google_address_autocomplete.SelfOrderAddressInput";
    static components = { SelfOrderAddressAutoComplete };
    props = useProps({
        state: t.object(),
    });

    setup() {
        this.autoCompleteProps = {
            record: this.makeAddressRecord(),
            name: "street",
            placeholder: _t("Address"),
            addressFieldMap: {
                street: "street",
                city: "city",
                zip: "zip",
                country_id: "countryId",
                state_id: "stateId",
            },
        };
    }

    makeAddressRecord() {
        const state = this.props.state;
        const bus = new EventBus();
        const invalidFields = new Set();
        return {
            data: state,
            fields: {
                street: { type: "char", trim: false, size: false, translate: false },
                city: { type: "char", trim: false, size: false, translate: false },
                zip: { type: "char", trim: false, size: false, translate: false },
                countryId: { type: "many2one" },
                stateId: { type: "many2one" },
            },
            activeFields: {
                street: true,
                city: true,
                zip: true,
                countryId: true,
                stateId: true,
            },
            model: { bus },
            isValid: true,
            resetFieldValidity: (name) => invalidFields.delete(name),
            setInvalidField: (name) => invalidFields.add(name),
            isFieldInvalid: (name) => invalidFields.has(name),
            isFieldTranslatable: () => false,
            update: async (values) => {
                for (const [key, value] of Object.entries(values)) {
                    if (key === "countryId") {
                        state.countryId = value?.id || value || null;
                    } else if (key === "stateId") {
                        state.stateId = value?.id || value || null;
                    } else {
                        state[key] = value || "";
                    }
                }
                state.validationError = null;
            },
        };
    }
}

registry.category("pos_self_order.address_inputs").add("google_address_autocomplete", {
    Component: SelfOrderAddressInput,
    isAvailable: (selfOrder) => selfOrder.config._has_google_places_api_key,
});
