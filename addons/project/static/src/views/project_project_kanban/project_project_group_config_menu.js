import { usePlugin } from "@odoo/owl";
import { GroupConfigMenu } from "@web/views/view_components/group_config_menu";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class ProjectProjectGroupConfigMenu extends GroupConfigMenu {
    setup() {
        super.setup();
        this.action = usePlugin(ActionPlugin);
    }

    async deleteGroup() {
        if (this.group.groupByField.name === "stage_id") {
            const action = await this.group.model.orm.call(
                this.group.groupByField.relation,
                "unlink_wizard",
                [this.group.value],
                { context: this.group.context }
            );
            this.action.doAction(action);
            return;
        }
        super.deleteGroup();
    }
}
