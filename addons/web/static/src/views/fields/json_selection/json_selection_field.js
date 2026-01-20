import { Component, useState, onWillStart, onWillUpdateProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { useService } from "@web/core/utils/hooks";
import { useRecordObserver } from "@web/model/relational_model/utils";

export class JsonSelection extends Component {
    static template = "web.JsonSelection";
    static components = {};
    static props = {
        ...standardFieldProps,
    };

    setup() {
        super.setup();

        this.orm = useService("orm");
        this.state = useState({
            identifiers: this.parseValue(this.props.record.data[this.props.name]),
            country: this.props.record.data.country_code || false,
        });

        onWillStart(async () => {
            this.formats = await this.orm.call("res.partner", "get_available_identifiers");
        });
        onWillUpdateProps((nextProps) => {
            this.state.identifiers = this.parseValue(nextProps.record.data[nextProps.name]);
        });

        useRecordObserver((record) => {
            Object.assign(this.state.identifiers, record.data[this.props.name]);
        });
    }

    parseValue(val) {
        // Handle empty/null values gracefully
        return val ? JSON.parse(JSON.stringify(val)) : [];
    }

    async updateBackend() {
        // Basic validation: remove empty rows
        // Complex validation is done python side
        const cleanData = this.state.identifiers.filter((r) => r.key && r.value);
        await this.props.record.update({ [this.props.name]: cleanData });
    }

    // --- Actions ---

    addRow() {
        this.state.identifiers.push({ key: "", value: "" });
    }

    removeRow(index) {
        this.state.identifiers.splice(index, 1);
        this.updateBackend();
    }

    onChangeRow(index, field, event) {
        this.state.identifiers[index][field] = event.target.value;
        this.updateBackend();
    }
}

export const jsonSelection = {
    component: JsonSelection,
    supportedOptions: [],
    supportedTypes: ["json"],
    extractProps({ options }) {
        return {};
    },
};

registry.category("fields").add("json_selection", jsonSelection);
