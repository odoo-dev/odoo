import { Component, usePlugin } from "@odoo/owl";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

const cogMenuRegistry = registry.category("cogMenu");

class ConvertProjectToTemplateCogMenu extends Component {
    static template = "project.ConvertProjectToTemplateCogMenu";
    static components = { DropdownItem };

    setup() {
        this.action = usePlugin(ActionPlugin);
    }

    toggleProjectTemplateMode() {
        this.action.doActionButton({
            type: "object",
            resId: this.env.searchModel.context.active_id,
            name: "action_toggle_project_template_mode",
            resModel: "project.project",
        });
    }
}

export const ConvertProjectToTemplateMenuItem = {
    Component: ConvertProjectToTemplateCogMenu,
    groupNumber: 0,
    isDisplayed: async ({ config, searchModel }) => {
        return (
            searchModel.resModel === "project.task" &&
            ["kanban", "list"].includes(config.viewType) &&
            config.actionType === "ir.actions.act_window" &&
            searchModel.context.active_id &&
            await user.hasGroup("project.group_project_manager")
        );
    },
};

cogMenuRegistry.add("convert-project-to-template-menu", ConvertProjectToTemplateMenuItem);
