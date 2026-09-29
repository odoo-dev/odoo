import { Component, proxy, useEffect, usePlugin, useProps } from "@odoo/owl";
import { CheckBox } from "@web/core/checkbox/checkbox";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { UIPlugin } from "@web/core/ui/ui_plugin";
import { standardFieldProps } from "../standard_field_props";

export const booleanFieldProps = {
    ...standardFieldProps,
};

export class BooleanField extends Component {
    static template = "web.BooleanField";
    static components = { CheckBox };
    props = useProps(booleanFieldProps);

    setup() {
        this.ui = usePlugin(UIPlugin);
        this.state = proxy({});
        useEffect(() => {
            this.state.value = this.props.record.data[this.props.name];
        });
    }

    get displayAsToggle() {
        return this.ui.isSmall;
    }

    /**
     * @param {boolean} newValue
     */
    onChange(newValue) {
        this.state.value = newValue;
        this.props.record.update({ [this.props.name]: newValue });
    }
}

export const booleanField = {
    component: BooleanField,
    displayName: _t("Checkbox"),
    supportedTypes: ["boolean"],
    isEmpty: () => false,
};

registry.category("fields").add("boolean", booleanField);
