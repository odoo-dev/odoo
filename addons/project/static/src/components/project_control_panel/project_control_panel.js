/** @odoo-module **/

import { ControlPanel } from "@web/search/control_panel/control_panel";
import { orm } from "@web/core/orm";
import { user } from "@web/core/user";
import { onWillStart } from "@odoo/owl";

export class ProjectControlPanel extends ControlPanel {
    static template = "project.ProjectControlPanel";
    setup() {
        super.setup();
        const { active_id, show_project_update } = this.env.searchModel.globalContext;
        this.showProjectUpdate = this.env.config.viewType === "form" || show_project_update;
        this.projectId = this.showProjectUpdate ? active_id : false;

        onWillStart(async () => {
            if (this.showProjectUpdate) {
                await this.loadData();
            }
        });
    }

    async loadData() {
        const [data, isProjectUser] = await Promise.all([
            orm.call("project.project", "get_last_update_or_default", [this.projectId]),
            user.hasGroup("project.group_project_user"),
        ]);
        this.data = data;
        this.isProjectUser = isProjectUser;
    }

    async onStatusClick(ev) {
        ev.preventDefault();
        this.actionService.doAction("project.project_update_all_action", {
            additionalContext: {
                default_project_id: this.projectId,
                active_id: this.projectId,
            },
        });
    }
}
