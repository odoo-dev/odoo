import { KanbanRecord, kanbanRecordProps } from "@web/views/kanban/kanban_record";
// import { KanbanDropdownMenuWrapper } from "@web/views/kanban/kanban_dropdown_menu_wrapper";
import { useService } from "@web/core/utils/hooks";

import { onMounted, proxy, t, useProps } from "@odoo/owl";
import { IMAGE_MIMETYPES } from "@html_editor/main/media/media_manager/helpers";

// import {
//     IMAGE_MIMETYPES,
//     QueryHelper,
//     VIDEO_MIMETYPES,
//     ATTACHMENT_FIELDS,
//     QUERRY_ORDERS_BY,
// } from "@html_editor/main/media/media_manager/helpers";

// export class MediaManagerKanbanDropdownMenuWrapper extends KanbanDropdownMenuWrapper {
//     onClick(ev) {
//         console.warn("MediaManagerKanbanDropdownMenuWrapper::onClick", ev);
//         // Keep the dropdown open as we need the fileupload to remain in the dom
//         if (!ev.target.tagName === "INPUT" && !ev.target.closest(".file_upload_kanban_action_a")) {
//             super.onClick(ev);
//         }
//     }
// }

const LS_IS_STARRED_KEY = "ir-attachment-record-is-starred";
export const MediaManagerkanbanRecordProps = {
    ...kanbanRecordProps,
    canMultiSelect: t.any().optional(true),
    onSelectCallback: t.function().optional(() => () => {}),
};

export class MediaManagerKanbanRecord extends KanbanRecord {
    static template = "ir.attachment.MediaManagerKanbanRecord";
    static menuTemplate = "web.KanbanMenu";
    static components = {
        ...KanbanRecord.components,
        //KanbanDropdownMenuWrapper: MediaManagerKanbanDropdownMenuWrapper,
    };

    props = useProps(MediaManagerkanbanRecordProps);

    setup() {
        console.groupCollapsed("new MediaManagerKanbanRecord");
        console.warn("setup() trace");
        console.log("this : ", this);
        console.log("props : ", this.props);
        // console.log("record : ", { ...this.props.record });
        console.log(this.constructor.menuTemplate);
        console.groupEnd();
        this.state = proxy({
            starred: this.getLocalStorageStarredState(),
            selected: false,
        });

        this.fileViewer = useService("fileViewer")();
        super.setup();
        onMounted(() => {
            console.log("              ====>   this.rootRef()", this.rootRef());
            const previewMenuItem = this.rootRef().querySelector("[name=open_preview]");
            console.log("              ====>   previewMenuItem", previewMenuItem);
        });
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

    // events listener
    onGlobalClick(ev, newWindow) {
        // based on onGlobalClick in KanbanRecord
        if (ev.target.closest(this.constructor.CANCEL_GLOBAL_CLICK)) {
            return;
        }
        console.warn("MediaManagerKanbanRecord::onGlobalClick", ev);
        if (!this.props.canMultiSelect) {
            this.toggleSelected();
        } else if (!ev.target.closest(".o_record_interactive")) {
            this.previewRecord();
        }

        // const { forceGlobalClick, canOpenRecords, openAction, openRecord, record } = this.props;
        // if (!forceGlobalClick && openAction) {
        //     this.action.doActionButton(
        //         {
        //             name: openAction.action,
        //             type: openAction.type,
        //             resModel: record.resModel,
        //             resId: record.resId,
        //             resIds: record.resIds,
        //             context: record.context,
        //             onClose: async () => {
        //                 await record.model.root.load();
        //             },
        //         },
        //         {
        //             newWindow,
        //         }
        //     );
        // } else if (forceGlobalClick || canOpenRecords) {
        //     openRecord(record, { newWindow });
        // }
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
