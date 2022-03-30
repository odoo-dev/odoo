/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _lt } from "@web/core/l10n/translation";
import { standardFieldProps } from "./standard_field_props";

const { Component } = owl;

export class UrlField extends Component {
    get formattedHref() {
        let value = "";
        if (typeof this.props.value === "string") {
            const shouldaddPrefix = !(
                this.props.options.website_path ||
                this.props.value.includes("://") ||
                /^\//.test(this.props.value)
            );
            value = shouldaddPrefix ? `http://${this.props.value}` : this.props.value;
        }
        return value;
    }
    get formattedValue() {
        return typeof this.props.value === "string" ? this.props.value : "";
    }
    /**
     * @param {Event} ev
     */
    onChange(ev) {
        let value = ev.target.value;
        if (this.props.record.fields[this.props.name].trim) {
            value = value.trim();
        }
        this.props.update(value || false);
    }
}

Object.assign(UrlField, {
    template: "web.UrlField",
    props: {
        ...standardFieldProps,
        placeholder: { type: String, optional: true },
    },

    displayName: _lt("URL"),
    supportedTypes: ["char"],
});

registry.category("fields").add("url", UrlField);
