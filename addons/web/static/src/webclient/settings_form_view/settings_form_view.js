/** @odoo-module **/

import { registry } from "@web/core/registry";
import { intersection } from "@web/core/utils/arrays";
import { ControlPanel } from "@web/search/control_panel/control_panel";
import { formView } from "@web/views/form/form_view";
import { SettingsFormController } from "./settings_form_controller";
import { SettingsFormRenderer } from "./settings_form_renderer";
import { SettingsFormCompiler } from "./settings_form_compiler";
import { SettingsArchParser } from "./settings_form_arch_parser";

class SettingRecord extends formView.Model.Record {
    _update(changes) {
        const changedFields = Object.keys(changes);
        let dirty = true;
        if (intersection(changedFields, this.model._headerFields).length === changedFields.length) {
            dirty = this.dirty;
        }
        const prom = super._update(...arguments);
        this.dirty = dirty;
        return prom;
    }
}

class SettingModel extends formView.Model {
    setup(params) {
        super.setup(...arguments);
        this._headerFields = params.headerFields;
    }
    _getNextConfig() {
        const nextConfig = super._getNextConfig(...arguments);
        nextConfig.resId = false;
        return nextConfig;
    }

}
SettingModel.Record = SettingRecord;

export const settingsFormView = {
    ...formView,
    display: {},
    buttonTemplate: "web.SettingsFormView.Buttons",
    ArchParser: SettingsArchParser,
    Model: SettingModel,
    ControlPanel: ControlPanel,
    Controller: SettingsFormController,
    Compiler: SettingsFormCompiler,
    Renderer: SettingsFormRenderer,
};

registry.category("views").add("base_settings", settingsFormView);
