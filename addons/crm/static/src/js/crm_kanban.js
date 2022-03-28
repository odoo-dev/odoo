/** @odoo-module **/

import { registry } from "@web/core/registry";
import { KanbanDynamicGroupList, KanbanModel } from "@web/views/kanban/kanban_model";
import { KanbanView } from "@web/views/kanban/kanban_view";

export class CRMKanbanDynamicGroupList extends KanbanDynamicGroupList {
    /**
     * This Kanban Model makes sure we display a rainbowman
     * message when a lead is won after we moved it in the
     * correct column and when it's grouped by the default group by (stage_id).
     *
     * @override
     */
    async moveRecord() {
        const record = await super.moveRecord(...arguments);

        if (this.model.defaultGroupBy && this.firstGroupBy === this.model.defaultGroupBy) {
            const message = await this.model.orm.call("crm.lead", "get_rainbowman_message", [
                [record.resId],
            ]);
            if (message) {
                this.model.effectService.add({ type: "rainbow_man", message });
            }
        }

        return record;
    }
}

export class CRMKanbanModel extends KanbanModel {
    setup(_params, services) {
        super.setup(...arguments);

        this.effectService = services.effect;
    }
}

CRMKanbanModel.DynamicGroupList = CRMKanbanDynamicGroupList;
CRMKanbanModel.services = [...KanbanModel.services, "effect"];

export class CRMKanbanView extends KanbanView {}

CRMKanbanView.Model = CRMKanbanModel;

registry.category("views").add("crm_kanban", CRMKanbanView);
