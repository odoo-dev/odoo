import { _t } from "@web/core/l10n/translation";
import { omit } from "@web/core/utils/objects";
import { IMAGE_MIMETYPES } from "@html_editor/main/media/media_manager/helpers";

import { useService } from "@web/core/utils/hooks";
import {
    SelectCreateDialog,
    selectCreateDialogProps,
} from "@web/views/view_dialogs/select_create_dialog";
import { props, t } from "@odoo/owl";

export const mediaManagerDialogProps = {
    ...selectCreateDialogProps,
    resModel: t.string(),
    baseResModel: t.string(),
    baseResId: t.number(),
    domain: t.array().optional(),
    context: t.object().optional(),
};

export class MediaManagerDialog extends SelectCreateDialog {
    static template = "html_editor.MediaManagerDialog";
    props = props(mediaManagerDialogProps);
    document = document;

    setup() {
        console.warn("MediaManagerDialog setup", { ...this.props });
        console.log("  => this", this);
        console.log("  => props", { ...this.props });

        super.setup();
        // this.state = proxy({
        //     resIds: [],
        // });
        this.orm = useService("orm");

        // const { thread = {}, model, resId } = this.props.chatterParams || this.props; // todo : I don't think we need this

        this.onSelectionChanged = (resIds, records) => {
            console.log(JSON.parse(JSON.stringify(records)));
            console.log(JSON.parse(JSON.stringify(resIds)));
            this.superOnSelectionChanged(resIds);
        };
    }

    get viewProps() {
        const baseProps = super.viewProps;
        this.superOnSelectionChanged = baseProps.onSelectionChanged;
        const props = {
            ...omit(baseProps, "forceGlobalClick", "display", "onSelectionChanged"),
            type: "kanban",
            allowSelectors: true,
            baseResModel: this.props.baseResModel,
            baseResId: this.props.baseResId,
            onSelectionChanged: this.onSelectionChanged,
        };
        console.warn("get viewProps", { ...props });
        return props;
    }

    get isNewRecord() {
        console.error("TODO");
        return this.props.chatterParams?.isNewRecord;
    }
    async select(resIds) {
        console.warn("select");
        if (this.props.onSelected) {
            this.executeOnceAndClose(() => this.props.onSelected(resIds));
        }
    }

    // /**
    //  * Pastes document/s share links.
    //  * @param {Array} resIds - List of resIDs of the selected records (documents).
    //  */
    // async pasteDocumentsLink(resIds) {
    //     let response;
    //     try {
    //         response = await this.orm.read("documents.document", resIds, [
    //             "display_name",
    //             "access_url",
    //         ]);
    //     } catch (error) {
    //         this.notification.add(
    //             _t("Failed to paste link(s): ") + (error.data?.message || error.toString()),
    //             { type: "danger" }
    //         );
    //         this.props.close();
    //         return;
    //     }
    //     if (this.props.chatterParams.isFromFullComposer) {
    //         this.props.chatterParams.addDocumentsBus.trigger("PASTE_SHARE_LINKS", {
    //             links: response,
    //         });
    //     } else {
    //         this.addToThread(this.model, this.resId);
    //         const shareLinks = response
    //             .map(({ display_name, access_url }) => `${display_name}: ${access_url}`)
    //             .join("\n");
    //         this.props.chatterParams.composer.composerText += `\n${shareLinks}`;
    //     }
    //     this.notification.add(_t("Link(s) pasted!"), { type: "success" });
    //     this.props.close();
    // }

    // /**
    //  * Adds the document (as an attachment) to the composer.
    //  * @param {Array} resIds - List of resIDs of the selected records (documents).
    //  */
    // async addDocumentsAttachment(resIds) {
    //     let processedAttachments;
    //     try {
    //         // Temporary linked to the composer with id 0 to be garbage collected if not re-linked to the thread
    //         // (similar to what is done when uploading a file)
    //         const attachmentRecords = await this.orm.call(
    //             "documents.document",
    //             "add_documents_attachment",
    //             [resIds, "mail.compose.message", 0]
    //         );
    //         processedAttachments = await this._processAttachments(attachmentRecords);
    //     } catch (error) {
    //         this.notification.add(
    //             _t("Failed to add document(s): ") + (error.data?.message || error.toString()),
    //             { type: "danger" }
    //         );
    //         this.props.close();
    //         return;
    //     }
    //     const thread = this.props.chatterParams?.thread || this.addToThread(this.model, this.resId);
    //     const composer = this.props.chatterParams?.composer || thread.composer;
    //
    //     const attachmentIds = [];
    //     for (const { name, ...attachmentRecord } of processedAttachments) {
    //         const extension = name.slice(Math.max(0, name.lastIndexOf(".") + 1));
    //         composer.attachments.push({
    //             name,
    //             extension,
    //             has_thumbnail: false,
    //             ...attachmentRecord,
    //         });
    //         attachmentIds.push(attachmentRecord.id);
    //     }
    //     this.props.chatterParams.saveRecordHandler?.(attachmentIds);
    //     this.props.close();
    // }
}

export function getMediaManagertDialogProps(recordInfo) {
    console.warn("getMediaManagertDialogProps, recordInfo", recordInfo);
    return {
        resModel: "ir.attachment", // todo we probably don't need this
        baseResModel: recordInfo.resModel ?? "ir.attachment",
        baseResId: recordInfo.resId ?? -1,
        title: _t("Select a media"),
        noCreate: true,
        domain: [
            ["mimetype", "in", IMAGE_MIMETYPES],
            ["type", "=", "binary"], // todo : this prevent webp url to be shown, should we change that ?
            "|",
            ["public", "=", true],
            "&",
            ["res_model", "=", recordInfo.resModel],
            ["res_id", "=", recordInfo.resId || -1],
            // ...queryHelper.imagesDomain,
        ],
        context: {
            // for python ?
            // list_view_ref: "documents.documents_view_list_add_documents_attachment",
            // documents_search_panel_no_trash: true,
            // documents_view_secondary: true,
        },
    };
}
