import { DataCleaningCommonListController } from "@data_recycle/views/data_cleaning_common_list";
import { registry } from '@web/core/registry';
import { listView } from '@web/views/list/list_view';

export class DataRecycleListController extends DataCleaningCommonListController {
    get staticControlPanelButtons() {
        return {
            ...super.staticControlPanelButtons,
            validate: {
                isAvailable: () => this.hasSelectedRecords,
                template: "DataRecycle.buttons.Validate",
            },
            unselect: {
                isAvailable: () => this.hasSelectedRecords,
                template: "DataRecycle.buttons.Unselect",
            },
        };
    }
    /**
     * Validate all the records selected
     */
    async onValidateClick() {
        const record_ids = await this.model.root.getResIds(true);

        await this.orm.call('data_recycle.record', 'action_validate', [record_ids]);
        await this.model.load();
    }
};

registry.category('views').add('data_recycle_list', {
    ...listView,
    Controller: DataRecycleListController,
});

