import { listView } from "@web/views/list/list_view";
import { registry } from "@web/core/registry";
import { RelationalModel } from "@web/model/relational_model/relational_model";

/**
 * Reordering manufacturing orders reschedules all of them (their dates follow their position):
 * reload the view after a reordering, so that every MO shows its new dates (and, in the kanban
 * grouped by week, lands in the column of its new start date).
 */
class MrpProductionRecordList extends RelationalModel.DynamicRecordList {
    // drag and drop in an ungrouped list (`moveRecords` also goes through it)
    async resequence(...args) {
        const result = await super.resequence(...args);
        await this.model.load();
        return result;
    }
}

class MrpProductionGroupList extends RelationalModel.DynamicGroupList {
    async moveRecords(...args) {
        const result = await super.moveRecords(...args);
        await this.model.load();
        return result;
    }
}

export class MrpProductionModel extends RelationalModel {
    static DynamicRecordList = MrpProductionRecordList;
    static DynamicGroupList = MrpProductionGroupList;
}

export const mrpProductionListView = {
    ...listView,
    Model: MrpProductionModel,
};

registry.category("views").add("mrp_production_list", mrpProductionListView);
