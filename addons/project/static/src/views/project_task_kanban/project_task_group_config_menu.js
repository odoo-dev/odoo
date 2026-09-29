import { onWillStart, usePlugin } from "@odoo/owl";
import { user } from "@web/core/user";
import { GroupConfigMenu } from "@web/views/view_components/group_config_menu";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class ProjectTaskGroupConfigMenu extends GroupConfigMenu {
    setup() {
        super.setup();
        this.action = usePlugin(ActionPlugin);

        this.isProjectManager = false;
        onWillStart(async () => {
            if (this.props.list.isGroupedByStage) {
                this.isProjectManager = await user.hasGroup("project.group_project_manager");
            }
        });
    }

    async deleteGroup() {
        return this.props.deleteGroup(this.group);
    }

    canEditGroup() {
        return super.canEditGroup() && (!this.props.list.isGroupedByStage || this.isProjectManager);
    }

    canDeleteGroup() {
        return (
            super.canDeleteGroup() && (!this.props.list.isGroupedByStage || this.isProjectManager)
        );
    }
}
