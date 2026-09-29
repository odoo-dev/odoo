import { usePlugin } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { CalendarYearPopover } from "@web/views/calendar/calendar_year/calendar_year_popover";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

export class ActivityCalendarYearPopover extends CalendarYearPopover {
    setup() {
        super.setup();
        this.orm = useService("orm");
        this.actionService = usePlugin(ActionPlugin);
    }

    async onRecordClick(record) {
        const action = await this.orm.call("mail.activity", "action_open_document", [
            record.rawRecord.id,
        ]);
        this.actionService.doAction(action, { onClose: () => this.props.model.load() });
        this.props.close();
    }
}
