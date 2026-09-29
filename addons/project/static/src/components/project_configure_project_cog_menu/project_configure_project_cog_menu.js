import { Component, usePlugin } from "@odoo/owl";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

const cogMenuRegistry = registry.category("cogMenu");

class ConfigureProjectCogMenu extends Component {
    static template = "project.ConfigureProjectCogMenu";
    static components = { DropdownItem };

    setup() {
        this.action = usePlugin(ActionPlugin);
    }

    openProjectForm() {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "project.project",
            res_id: this.env.searchModel.context.active_id,
            views: [[false, "form"]],
            target: "current",
        });
    }
}

export const ConfigureProjectMenuItem = {
    Component: ConfigureProjectCogMenu,
    groupNumber: 0,
    isDisplayed: async ({ config, searchModel }) =>
        searchModel.resModel === "project.task" &&
        ["kanban", "list"].includes(config.viewType) &&
        config.actionType === "ir.actions.act_window" &&
        searchModel.context.active_id &&
        (await user.hasGroup("project.group_project_manager")),
};

cogMenuRegistry.add("configure-project-menu", ConfigureProjectMenuItem);
