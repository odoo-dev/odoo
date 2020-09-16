/** @odoo-module alias=mail.components.Attachment **/

import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb, useState } = owl;

class Attachment extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            hasDeleteConfirmDialog: false,
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Return the url of the attachment.
     * Uploading attachments do not have an url.
     *
     * @returns {string}
     */
    get attachmentUrl() {
        if (this.attachment.isUploading(this)) {
            return '';
        }
        return this.env.session.url('/web/content', {
            id: this.attachment.id(this),
            download: true,
        });
    }

    /**
     * Get the details mode after auto mode is computed
     *
     * @returns {string} 'card', 'hover' or 'none'
     */
    get detailsMode() {
        if (this.detailsMode !== 'auto') {
            return this.detailsMode;
        }
        if (this.attachment.fileType(this) !== 'image') {
            return 'card';
        }
        return 'hover';
    }

    /**
     * Get the attachment representation style to be applied
     *
     * @returns {string}
     */
    get imageStyle() {
        if (this.attachment.fileType(this) !== 'image') {
            return '';
        }
        if (this.env.isQUnitTest) {
            // background-image:url is hardly mockable, and attachments in
            // QUnit tests do not actually exist in DB, so style should not
            // be fetched at all.
            return '';
        }
        let size;
        if (this.detailsMode === 'card') {
            size = '38x38';
        } else {
            size = '160x160';
        }
        // background-size set to override value from `o_image` which makes small image stretched
        return `background-image:url(/web/image/${
            this.attachment.id(this)
        }/${size}/?crop=true); background-size: auto;`;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Download the attachment when clicking on donwload icon.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDownload(ev) {
        ev.stopPropagation();
        this.env.services.navigate(
            `/web/content/ir.attachment/${
                this.attachment.id(this)
            }/datas`,
            { download: true },
        );
    }

    /**
     * Open the attachment viewer when clicking on viewable attachment.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickImage(ev) {
        if (!this.attachment.isViewable(this)) {
            return;
        }
        this.env.services.action.dispatch(
            'Attachment/view',
            {
                attachment: this.attachment,
                attachments: this.attachments,
            },
        );
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickUnlink(ev) {
        ev.stopPropagation();
        if (!this.attachmentUrl) {
            return;
        }
        if (this.attachment.isLinkedToComposer(this)) {
            this.env.services.action.dispatch(
                'Attachment/remove',
                this.attachment,
            );
            this.trigger(
                'o-attachment-removed',
                { attachment: this.attachment },
            );
        } else {
            this.state.hasDeleteConfirmDialog = true;
        }
    }

   /**
    * @private
    */
    _onDeleteConfirmDialogClosed() {
        this.state.hasDeleteConfirmDialog = false;
    }
}

Object.assign(Attachment, {
    defaultProps: {
        attachments: [],
        detailsMode: 'auto',
        imageSize: 'medium',
        isDownloadable: false,
        isEditable: true,
        showExtension: true,
        showFilename: true,
    },
    props: {
        attachment: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Attachment') {
                    return false;
                }
                return true;
            },
        },
        attachments: {
            type: Array,
            element: Object,
            validate(p) {
                for (const i of p) {
                    if (i.constructor.modelName !== 'Attachment') {
                        return false;
                    }
                }
                return true;
            },
        },
        detailsMode: {
            type: String,
            validate: prop => ['auto', 'card', 'hover', 'none'].includes(prop),
        },
        imageSize: {
            type: String,
            validate: prop => ['small', 'medium', 'large'].includes(prop),
        },
        isDownloadable: Boolean,
        isEditable: Boolean,
        showExtension: Boolean,
        showFilename: Boolean,
    },
    template: 'mail.Attachment',
});

QWeb.registerComponent('Attachment', Attachment);

export default Attachment;
