/* @odoo-module */

import { Component } from "@odoo/owl";

import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";

export class AttachmentList extends Component {
    setup() {
        // Arbitrary high value, this is effectively a max-width.
        this.imagesWidth = 1920;
        this.imageMimetypes = new Set([
            "image/bmp",
            "image/gif",
            "image/jpeg",
            "image/png",
            "image/svg+xml",
            "image/tiff",
            "image/x-icon",
        ]);
        this.dialog = useService("dialog");
    }

    get nonImagesAttachments() {
        return this.props.attachments.filter(({ mimetype }) => !this.imageMimetypes.has(mimetype));
    }

    get imagesAttachments() {
        return this.props.attachments.filter(({ mimetype }) => this.imageMimetypes.has(mimetype));
    }

    getImageUrl(attachment) {
        const { imagesHeight } = this.props;
        if (
            !this.env.inComposer &&
            !this.env.inChatter &&
            !attachment.accessToken &&
            attachment.originThread &&
            !attachment.originThread.model
        ) {
            return `/mail/channel/${attachment.originThread.id}/image/${attachment.id}/${this.imagesWidth}x${imagesHeight}`;
        }
        const accessToken = attachment.accessToken ? `?access_token=${attachment.accessToken}` : "";
        return `/web/image/${attachment.id}/${this.imagesWidth}x${imagesHeight}${accessToken}`;
    }

    getDownloadUrl(attachment) {
        const accessToken = attachment.accessToken ? `access_token=${attachment.accessToken}&` : "";
        return `/web/content/ir.attachment/${attachment.id}/datas?${accessToken}download=true`;
    }

    canDelete(attachment) {
        return !attachment.uploading;
    }

    canDownload(attachment) {
        return !attachment.uploading && !this.env.inComposer;
    }

    onClickDownload(attachment) {
        const downloadLink = document.createElement("a");
        downloadLink.setAttribute("href", this.getDownloadUrl(attachment));
        // Adding 'download' attribute into a link prevents open a new
        // tab or change the current location of the window. This avoids
        // interrupting the activity in the page such as rtc call.
        downloadLink.setAttribute("download", "");
        downloadLink.click();
    }

    onClickUnlink(attachment) {
        if (this.env.inComposer) {
            return this.props.unlinkAttachment(attachment);
        }
        this.dialog.add(ConfirmationDialog, {
            body: sprintf(this.env._t('Do you really want to delete "%s"?'), attachment.filename),
            cancel: () => {},
            confirm: () => {
                this.props.unlinkAttachment(attachment);
            },
        });
    }

    get isInChatWindowAndIsAlignedRight() {
        return this.env.inChatWindow && this.env.alignedRight;
    }

    get isInChatWindowAndIsAlignedLeft() {
        return this.env.inChatWindow && !this.env.alignedRight;
    }
}

Object.assign(AttachmentList, {
    props: ["attachments", "unlinkAttachment", "imagesHeight"],
    template: "mail.attachment_list",
});
