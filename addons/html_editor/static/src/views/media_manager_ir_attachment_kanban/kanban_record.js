import { KanbanRecord, kanbanRecordProps } from "@web/views/kanban/kanban_record";
import { useService } from "@web/core/utils/hooks";

import { proxy, t, useProps } from "@odoo/owl";
import { IMAGE_MIMETYPES } from "@html_editor/main/media/media_manager/helpers";

const LS_IS_STARRED_KEY = "ir-attachment-record-is-starred";
export const MediaManagerkanbanRecordProps = {
    ...kanbanRecordProps,
    canMultiSelect: t.any().optional(true),
    onSelectCallback: t.function().optional(() => () => {}),
};

export class MediaManagerKanbanRecord extends KanbanRecord {
    static template = "ir.attachment.MediaManagerKanbanRecord";
    static components = {
        ...KanbanRecord.components,
    };

    props = useProps(MediaManagerkanbanRecordProps);

    setup() {
        console.groupCollapsed("%c MediaManagerKanbanRecord :: setup()", "background: #f99;");
        console.warn("setup() trace");
        console.log("this : ", this);
        console.log("props : ", this.props);
        console.groupEnd();
        this.state = proxy({
            starred: this.getLocalStorageStarredState(),
            selected: false,
        });

        this.fileViewer = useService("fileViewer")();
        super.setup();
    }

    getCardClasses() {
        const classes = super.getCardClasses().split(" ");
        if (this.state.starred) {
            classes.push("o_record_starred");
        }
        return classes.join(" ");
    }

    getLocalStorageStarredState() {
        const allStarredItems = JSON.parse(localStorage.getItem(LS_IS_STARRED_KEY)) || {};
        return !!allStarredItems[`id-${this.props.record.data.id}`];
    }

    updateLocalStorageStarredState() {
        const allStarredItems = JSON.parse(localStorage.getItem(LS_IS_STARRED_KEY)) || {};
        allStarredItems[`id-${this.props.record.data.id}`] = this.state.starred;
        localStorage.setItem(LS_IS_STARRED_KEY, JSON.stringify(allStarredItems));
    }

    onGlobalClick(ev, newWindow) {
        if (ev.target.closest(this.constructor.CANCEL_GLOBAL_CLICK)) {
            return;
        }
        console.warn("MediaManagerKanbanRecord::onGlobalClick", ev);

        if (!ev.target.closest(".o_record_interactive")) {
            this.toggleSelected();
        }
    }

    // actions
    previewRecord() {
        if (IMAGE_MIMETYPES.includes(this.props.record.data.mimetype)) {
            this.previewImage();
        }
    }

    previewImage() {
        const src = `/web/image/${this.props.record.data.id}`;
        const fileModel = {
            isImage: true,
            isViewable: true,
            name: this.props.record.data.displayName,
            defaultSource: src,
            downloadUrl: src,
        };
        this.fileViewer.open(fileModel);
    }

    toggleSelected() {
        this.rootRef().focus();
        const { record } = this.props;
        this.props.toggleSelection(record /*, ev.shiftKey*/);
        this.props.onSelectCallback(record);
    }

    toggleStarred() {
        this.rootRef().focus();
        this.state.starred = !this.state.starred;
        this.updateLocalStorageStarredState();
    }

    deleteItem() {
        const { deleteRecord, record } = this.props;
        deleteRecord(record);
    }
}
