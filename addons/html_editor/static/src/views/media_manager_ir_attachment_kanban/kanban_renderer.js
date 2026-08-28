import { KanbanRenderer, kanbanRendererProps } from "@web/views/kanban/kanban_renderer";
import { MediaManagerKanbanRecord } from "./kanban_record";
import { useService } from "@web/core/utils/hooks";
import { IMAGE_MIMETYPES } from "@html_editor/main/media/media_manager/helpers";
import { t, useProps } from "@odoo/owl";

export const MediaManagerKanbanRendererProps = {
    ...kanbanRendererProps,
    baseResModel: t.string(),
    baseResId: t.number().optional(),
};

export class MediaManagerKanbanRenderer extends KanbanRenderer {
    static template = "ir.attachment.MediaManagerKanbanRenderer";
    static components = {
        ...KanbanRenderer.components,
        KanbanRecord: MediaManagerKanbanRecord,
    };
    props = useProps(MediaManagerKanbanRendererProps);

    setup() {
        console.warn("MediaManagerKanbanRenderer::setup()", this);
        console.log("  ==> props", this.props);
        super.setup();
        this.uploadService = useService("upload");
        this.state.isDraggingFile = false;
    }

    // ----------------------------------
    // Upload files :
    // --------------

    uploadDragEnter(ev) {
        this.state.isDraggingFile = true;
    }

    uploadDragLeave(ev) {
        this.state.isDraggingFile = false;
    }

    uploadDrop(ev) {
        console.log("uploadDrop", ev);
        this.state.isDraggingFile = false;
        const files = [...ev.dataTransfer.items]
            .map((item) => item.getAsFile())
            .filter((file) => {
                // todo: add a way to configure the accepted file type ?
                if (IMAGE_MIMETYPES.includes(file.type)) {
                    return file;
                }
            });
        this.uploadFiles(files);
    }

    async uploadFiles(files) {
        const uploadData = {
            resModel: this.props.baseResModel,
            resId: this.props.baseResId,
            isImage: true, // todo : we should have a way to fussy upload multiple file type. determine the file type in the upload service probably.
        };
        console.log("uploadData", uploadData);

        await this.uploadService.uploadFiles(
            files,
            uploadData,
            this._fileUploaded.bind(this),
            (abort) => {
                // todo
            }
        );
    }

    _fileUploaded(attachment) {
        console.log("_fileUploaded", attachment.id, attachment);
        console.log("this", this);
        return this.env.model.load();
    }
}
