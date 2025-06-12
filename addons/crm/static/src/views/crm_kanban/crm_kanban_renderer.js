import { CrmColumnProgress } from "./crm_column_progress";
import { KanbanRecordQuickCreate } from "@web/views/kanban/kanban_record_quick_create";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { KanbanHeader } from "@web/views/kanban/kanban_header";

class CrmKanbanHeader extends KanbanHeader {
    static template = "crm.CrmKanbanHeader";
    static components = {
        ...KanbanHeader.components,
        ColumnProgress: CrmColumnProgress,
    };
}

class CrmLeadKanbanRecordQuickCreate extends KanbanRecordQuickCreate {
    async getQuickCreateProps(props) {
        await super.getQuickCreateProps(props);
        // context should always exist (required in KanbanQuickCreateController)
        this.quickCreateProps.context.is_kanban_quick_create_crm_lead = true;
    }
}

export class CrmKanbanRenderer extends KanbanRenderer {
    static components = {
        ...KanbanRenderer.components,
        KanbanHeader: CrmKanbanHeader,
        KanbanRecordQuickCreate: CrmLeadKanbanRecordQuickCreate,
    };
}
