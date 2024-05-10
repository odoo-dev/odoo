/** @odoo-module **/

import { useService } from "@web/core/utils/hooks";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { FileUploadProgressContainer } from "@web/core/file_upload/file_upload_progress_container";
import { FileUploadProgressKanbanRecord } from "@web/core/file_upload/file_upload_progress_record";

export class MrpDocumentsKanbanRenderer extends KanbanRenderer {
    static components = {
        ...KanbanRenderer.components,
        FileUploadProgressContainer,
        FileUploadProgressKanbanRecord,
    };
    static template = "mrp.MrpDocumentsKanbanRenderer";
    setup() {
        super.setup();
        this.fileUploadService = useService("file_upload");
    }
}

