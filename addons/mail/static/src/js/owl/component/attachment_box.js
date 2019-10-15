odoo.define('mail.component.AttachmentBox', function (require) {
'use strict';

const AttachmentList = require('mail.component.AttachmentList');
const core = require('web.core');

class AttachmentBox extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     * @override
     */
    constructor(...args) {
        super(...args);
        this.fileuploadId = _.uniqueId('o_AttachmentBox_fileupload');
        this._fileInputRef = owl.hooks.useRef('fileInput');
    }

    /**
     * @override
     */
    mounted() {
        this._attachmentUploadedEventListener = (...args) => this._onAttachmentUploaded(...args);
        $(window).on(this.fileuploadId, this._attachmentUploadedEventListener);
    }

    /**
     * @override
     */
    willUnmount() {
        $(window).off(this.fileuploadId, this._attachmentUploadedEventListener);
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Make sure any created attachment is linked to thread
     * @param {Object} fileData the files data for attachment creation
     * @return {Promise}
     * @private
     */
    async _createAttachment(fileData) {
        return await this.dispatch('createAttachment', {
            ...fileData,
            threadLocalId: this.props.threadLocalId
        });
    }

    /**
     * @param {Array} files
     * @return {Promise}
     * @private
     */
    async _createTemporaryAttachments(files) {
        for (const file of files) {
            const fileData = {
                filename: file.name,
                isTemporary: true,
                name: file.name
            };
            const attachmentLocalId = await this._createAttachment(fileData);
            await this.dispatch('linkAttachmentToThread', this.props.threadLocalId, attachmentLocalId);
        }
    }

    /**
     * @param {Array} files
     * @returns {Promise}
     * @private
     */
    async _unlinkExistingAttachments(files) {
        for (const file of files) {
            const attachment = this.storeProps.attachmentLocalIds
                .map(localId => this.env.store.state.attachments[localId])
                .find(attachment =>
                    attachment.name === file.name && attachment.size === file.size);
            // if the files already exits, delete the file before upload
            if (attachment) {
                await this.dispatch('unlinkAttachment', attachment.localId);
            }
        }
    }

    /**
     * @param {Array} files
     * @returns {Promise}
     * @private
     */
    async _uploadFiles(files) {
        let formData = new window.FormData();
        formData.append('callback', this.fileuploadId);
        formData.append('csrf_token', core.csrf_token);
        formData.append('id', '0');
        formData.append('model', 'mail.compose.message');
        for (const file of files) {
            // removing existing key with blank data and appending again with file info
            // In safari, existing key will not be updated when append with new file.
            formData.delete('ufile');
            formData.append('ufile', file, file.name);
            const response = await window.fetch('/web/binary/upload_attachment', {
                method: 'POST',
                body: formData,
            });
            let html = await response.text();
            const template = document.createElement('template');
            template.innerHTML = html.trim();
            window.eval.call(window, template.content.firstChild.textContent);
        }
        this._fileInputRef.el.value = '';
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {jQuery.Event} ev
     * @param {...Object} filesData
     */
    async _onAttachmentUploaded(ev, ...filesData) {
        const ids = [];
        for (const fileData of filesData) {
            const {
                error,
                filename,
                id,
                mimetype,
                name,
                size,
            } = fileData;
            if (error || !id) {
                this.env.do_warn(error);
                const temporaryAttachmentLocalId = this.env.store.state.temporaryAttachmentLocalIds[filename];
                if (temporaryAttachmentLocalId) {
                    this.dispatch('deleteAttachment', temporaryAttachmentLocalId);
                }
                return;
            }
            ids.push(await this._createAttachment({
                filename,
                id,
                mimetype,
                name,
                size
            }));
        }
        return ids;
    }

    /**
     * @private
     * @param {Event} ev
     */
    async _onChangeAttachment(ev) {
        const files = ev.target.files;
        await this._unlinkExistingAttachments(files);
        await this._createTemporaryAttachments(files);
        await this._uploadFiles(files);
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onClickAdd(ev) {
        this._fileInputRef.el.click();
    }
}

AttachmentBox.components = {
    AttachmentList,
};

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.resId
 * @param {string} ownProps.resModel
 * @return {Object}
 */
AttachmentBox.mapStoreToProps = function (state, ownProps) {
    const thread = state.threads && state.threads[ownProps.threadLocalId];
    let attachmentLocalIds = [];
    if (thread) {
        attachmentLocalIds = thread.attachmentLocalIds;
    }
    return { attachmentLocalIds };
};

AttachmentBox.props = {
    threadLocalId: String,
};

AttachmentBox.template = 'mail.component.AttachmentBox';

return AttachmentBox;

});
