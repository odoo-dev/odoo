import { usePlugin } from "@odoo/owl";
import { CalendarCommonPopover } from "@web/views/calendar/calendar_common/calendar_common_popover";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class ProjectCalendarCommonPopover extends CalendarCommonPopover {
    static defaultFooterButtonsTemplate = "project.ProjectCalendarCommonPopover.footer";

    setup() {
        super.setup();
        this.actionService = usePlugin(ActionPlugin);
    }

    onClickViewTasks() {
        this.actionService.doActionButton({
            type: "object",
            resId: this.props.record.id,
            name: "action_view_tasks",
            resModel: "project.project",
        });
    }
}
