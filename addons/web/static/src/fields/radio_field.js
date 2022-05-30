/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "./standard_field_props";

const { Component } = owl;

export class RadioField extends Component {
    setup() {
        this.id = `radio_field_${++RadioField.nextId}`;
    }

    get items() {
        switch (this.props.type) {
            case "selection":
                return this.props.record.fields[this.props.name].selection;
            case "many2one":
                return this.props.record.preloadedData
                    ? this.props.record.preloadedData[this.props.name]
                    : [];
            default:
                return [];
        }
    }
    get value() {
        switch (this.props.type) {
            case "selection":
                return this.props.value;
            case "many2one":
                return Array.isArray(this.props.value) ? this.props.value[0] : this.props.value;
            default:
                return null;
        }
    }

    /**
     * @param {any} value
     */
    onChange(value) {
        switch (this.props.type) {
            case "selection":
                this.props.update(value[0]);
                break;
            case "many2one":
                this.props.update(value);
                break;
        }
    }
}

RadioField.template = "web.RadioField";
RadioField.props = {
    ...standardFieldProps,
    horizontal: { type: Boolean, optional: true },
};
RadioField.displayName = _lt("Radio");
RadioField.supportedTypes = ["many2one", "selection"];
RadioField.isEmpty = () => false;
RadioField.convertAttrsToProps = (attrs) => {
    return {
        horizontal: Boolean(attrs.options.horizontal),
    };
};
RadioField.nextId = 0;

registry.category("fields").add("radio", RadioField);

export async function preloadRadio(orm, datapoint, fieldName) {
    const field = datapoint.fields[fieldName];
    if (field.type !== "many2one") {
        return null;
    }

    const context = datapoint.evalContext;
    const domain = datapoint.getFieldDomain(fieldName).toList(context);
    const records = await orm.searchRead(field.relation, domain, ["id"]);
    return await orm.call(field.relation, "name_get", [records.map((record) => record.id)]);
}

registry.category("preloadedData").add("radio", preloadRadio);
