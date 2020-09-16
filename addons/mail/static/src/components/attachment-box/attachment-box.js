/** @odoo-module alias=mail.components.AttachmentBox **/

import useDragVisibleDropZone from 'mail.componentHooks.useDragVisibleDropzone';
import usingModels from 'mail.componentMixins.usingModels';

const { Component, QWeb } = owl;
const { useRef } = owl.hooks;

class AttachmentBox extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.isDropZoneVisible = useDragVisibleDropZone();
        /**
         * Reference of the file uploader.
         * Useful to programmatically prompts the browser file uploader.
         */
        this._fileUploaderRef = useRef('fileUploader');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Get an object which is passed to FileUploader component to be used when
     * creating attachment.
     *
     * @returns {Object}
     */
    get newAttachmentExtraData() {
        return {
            originThread: this.env.services.action.dispatch(
                'RecordFieldCommand/link',
                this.thread,
            ),
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     */
    _onAttachmentCreated(ev) {
        // FIXME Could be changed by spying attachments count (task-2252858)
        this.trigger('o-attachments-changed');
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onAttachmentRemoved(ev) {
        // FIXME Could be changed by spying attachments count (task-2252858)
        this.trigger('o-attachments-changed');
    }

    /**
     * @private
     * @param {Event} ev
     */
    _onClickAdd(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        this._fileUploaderRef.comp.openBrowserFileUploader();
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {FileList} ev.detail.files
     */
    async _onDropZoneFilesDropped(ev) {
        ev.stopPropagation();
        await this._fileUploaderRef.comp.uploadFiles(ev.detail.files);
        this.isDropZoneVisible.value = false;
    }

}

Object.assign(AttachmentBox, {
    props: {
        thread: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Thread') {
                    return false;
                }
                return true;
            },
        },
    },
    template: 'mail.AttachmentBox',
});

QWeb.registerComponent('AttachmentBox', AttachmentBox);

export default AttachmentBox;
