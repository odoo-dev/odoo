/** @odoo-module **/

import { Component, useState, onWillStart } from "@odoo/owl";
import { _lt } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";

export class ImportDataOptions extends Component {
    setup() {
        this.orm = useService("orm");
        this.state = useState({
            options: [],
        });
        this.currentModel = this.props.fieldInfo.comodel_name || this.props.fieldInfo.model_name;
        onWillStart(async () => {
            this.state.options = await this.getOptions();
        });
    }
    get isVisible() {
        return ["many2one", "many2many", "selection", "boolean"].includes(
            this.props.fieldInfo.type
        );
    }
    async getOptions() {
        const options = [["prevent", _lt("Prevent import")]];
        if (this.props.fieldInfo.type === "boolean") {
            options.push(["false", _lt("Set to: False")]);
            options.push(["true", _lt("Set to: True")]);
            !this.props.fieldInfo.required &&
                options.push(["import_skip_records", _lt("Skip record")]);
        }
        if (["many2one", "many2many", "selection"].includes(this.props.fieldInfo.type)) {
            if (!this.props.fieldInfo.required) {
                options.push(["import_set_empty_fields", _lt("Set value as empty")]);
                options.push(["import_skip_records", _lt("Skip record")]);
            }
            if (this.props.fieldInfo.type === "selection") {
                const fields = await this.orm.call(this.currentModel, "fields_get");
                const selection = fields[this.props.fieldInfo.name].selection.map((opt) => [
                    opt[0],
                    sprintf(_lt("Set to: %s"), opt[1]),
                ]);
                options.push(...selection);
            } else {
                options.push(["name_create_enabled_fields", _lt("Create new values")]);
            }
        }
        return options;
    }
    onSelectionChanged(ev) {
        if (
            [
                "name_create_enabled_fields",
                "import_set_empty_fields",
                "import_skip_records",
            ].includes(ev.target.value)
        ) {
            this.props.onOptionChanged(ev.target.value, ev.target.value, this.props.fieldInfo.name);
        } else {
            const value = {
                fallback_value: ev.target.value,
                field_model: this.currentModel,
                field_type: this.props.fieldInfo.type,
            };
            this.props.onOptionChanged("fallback_values", value, this.props.fieldInfo.name);
        }
    }
}

ImportDataOptions.template = "ImportDataOptions";
ImportDataOptions.props = {
    importOptions: { type: Object, optional: true },
    fieldInfo: { type: Object },
    onOptionChanged: { type: Function },
};
