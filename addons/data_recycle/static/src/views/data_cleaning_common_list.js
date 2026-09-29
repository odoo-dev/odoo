import { usePlugin } from "@odoo/owl";
import { ListController } from "@web/views/list/list_controller";
import { useService } from "@web/core/utils/hooks";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";


export class DataCleaningCommonListController extends ListController {

    setup() {
        super.setup();
        this.orm = useService("orm");
        this.actionService = usePlugin(ActionPlugin);
        this.notificationService = useService("notification");
    }

    /**
     * Open the form view of the original record, and not the data_merge.record view
     * @override
     */
    openRecord(record) {
        this.actionService.doAction({
            type: 'ir.actions.act_window',
            views: [[false, 'form']],
            res_model: record.data.res_model_name,
            res_id: record.data.res_id && record.data.res_id.resId,
            context: {
                create: false,
                edit: false
            }
        });
    }

    /**
     * Unselect all the records
     */
    onUnselectClick() {
        this.discardSelection();
    }
};
