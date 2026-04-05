/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { debounce } from "@web/core/utils/timing";
import { useRecordObserver } from "@web/model/relational_model/utils";

class AdditionalIdentifiersCommon extends Component {
    static props = {
        ...standardFieldProps,
        seqMin: { type: Number, optional: true, default: 0 },
        seqMax: { type: Number, optional: true, default: 999 },
    };

    setup() {
        super.setup();

        this.orm = useService("orm");

        let value = this.props.record.data[this.props.name];
        let identifiers = {};
        if (value) {
            try {
                identifiers = typeof value === "string" ? JSON.parse(value) : { ...value };
            } catch (e) {
                identifiers = {};
            }
        }

        this.state = useState({
            identifiers: identifiers,
            metadata: {},
        });

        this.debouncedCommitChanges = debounce(this.commitChanges.bind(this), 50);

        useRecordObserver(async (record) => {
            let recordValue = record.data[this.props.name];
            let parsed = {};
            if (recordValue) {
                try {
                    parsed = typeof recordValue === "string" ? JSON.parse(recordValue) : { ...recordValue };
                } catch (e) {
                    parsed = {};
                }
            }
            this.state.identifiers = parsed;

            const countryCode = record.data.country_code;
            if (countryCode !== this.lastCountryCode) {
                this.lastCountryCode = countryCode;
                this.state.metadata = await this.orm.call("res.partner", "get_available_additional_identifiers_metadata",
                    [countryCode],
                    {
                        seq_min: this.props.seqMin,
                        seq_max: this.props.seqMax,
                    }
                );
            }
        });
    }

    commitChanges() {
        this.props.record.update({ [this.props.name]: this.state.identifiers });
    }
}

export class AdditionalIdentifiersButton extends AdditionalIdentifiersCommon {
    static template = "account.AdditionalIdentifiersButton";
    static components = { Dropdown, DropdownItem };

    get identifiersInDropdown() {
        const typesInUse = Object.keys(this.state.identifiers);
        return Object.entries(this.state.metadata)
            .filter(([k, v]) => !typesInUse.includes(k))
            .map(([k, v]) => ({
                identifierType: k,
                label: v.label || k,
                sequence: v.sequence || 100,
            }))
            .sort((a, b) => a.sequence - b.sequence);
    }

    onAdd(identifierType) {
        // Flat format `{ "KEY": "" }` to match the agreed database structure
        this.state.identifiers[identifierType] = "";
        this.debouncedCommitChanges();
    }
}

export class AdditionalIdentifiersList extends AdditionalIdentifiersCommon {
    static template = "account.AdditionalIdentifiersList";

    get sortedIdentifiers() {
        return Object.entries(this.state.identifiers)
            .sort(([keyA, _valA], [keyB, _valB]) => {
                const seqA = this.state.metadata[keyA]?.sequence || 100;
                const seqB = this.state.metadata[keyB]?.sequence || 100;
                return seqA - seqB;
            });
    }

    onUpdateValue(identifierType, event) {
        const currentVal = event.target.value.trim();
        if (currentVal === '') {
            delete this.state.identifiers[identifierType];
        } else {
            this.state.identifiers[identifierType] = currentVal;
        }
        this.debouncedCommitChanges();
    }
}

export const additionalIdentifiersButton = {
    component: AdditionalIdentifiersButton,
    extractProps: ({ attrs }) => ({
        seqMin: Number(attrs.seqMin) || 0,
        seqMax: Number(attrs.seqMax) || 199,
    }),
    supportedTypes: ["json"],
};

export const additionalIdentifiersList = {
    component: AdditionalIdentifiersList,
    extractProps: ({ attrs }) => ({
        seqMin: Number(attrs.seqMin) || 0,
        seqMax: Number(attrs.seqMax) || 199,
    }),
    supportedTypes: ["json"],
};

registry.category("fields").add("additional_identifiers_button", additionalIdentifiersButton);
registry.category("fields").add("additional_identifiers_list", additionalIdentifiersList);
