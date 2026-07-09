import { Component } from "@odoo/owl";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useDropdownCloser } from "@web/core/dropdown/dropdown_hooks";
import { _t } from "@web/core/l10n/translation";

const cogMenuRegistry = registry.category("cogMenu");

export class MassMailingSaveAsTemplateCogMenu extends Component {
    static template = "mass_mailing.MassMailingSaveAsTemplateCogMenu";
    static components = { DropdownItem };

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.dropdown = useDropdownCloser();
        this.label = _t("Save as Template");
    }

    async saveAsTemplate() {
        const res = await this.env.model.root.save();
        if (res) {
            const action = await this.orm.call("mailing.mailing", "action_save_as_template", [
                [this.env.model.root.resId],
            ]);
            await this.actionService.doAction(action);
            this.dropdown.closeAll();
        }
    }
}

export const MassMailingSaveAsTemplateCogMenuItem = {
    Component: MassMailingSaveAsTemplateCogMenu,
    groupNumber: 4,
    isDisplayed: async ({ config, searchModel }) =>
        searchModel.resModel === "mailing.mailing" &&
        !searchModel.globalContext.default_is_template &&
        config.viewType == "form" &&
        config.actionType === "ir.actions.act_window",
};

cogMenuRegistry.add("save-as-template-menu", MassMailingSaveAsTemplateCogMenuItem, {
    sequence: 10,
});
