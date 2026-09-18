import { proxy } from "@odoo/owl";
import { _t } from '@web/core/l10n/translation';
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { UploadDropZone } from "@account/components/upload_drop_zone/upload_drop_zone";
import { DocumentFileUploader } from "@account/components/document_file_uploader/document_file_uploader";
import { uploadFileFromData } from "../upload_file_from_data_hook";

export class FileUploadKanbanRenderer extends KanbanRenderer {
    static template = "account.FileUploadKanbanRenderer";
    static components = {
        ...KanbanRenderer.components,
        UploadDropZone,
        DocumentFileUploader,
    };

    setup() {
        super.setup();
        this.hasOwnFileUploader = false;
        this.dropzoneState = proxy({ visible: false });
        this.uploadFileFromData = uploadFileFromData();
        this.dropZoneTitle = _t("Drop and let the AI process your bills automatically.");
    }

    async onPaste(ev) {
        if (!ev.clipboardData?.items) {
            return;
        }
        ev.preventDefault();
        this.uploadFileFromData(ev.clipboardData);
    }

    onDragStart(ev) {
        if (ev.dataTransfer.types.includes("Files")) {
            this.dropzoneState.visible = true;
        }
    }
}
