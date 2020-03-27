odoo.define('mail.messaging.component.AttachmentBox', function (require) {
'use strict';

const components = {
    AttachmentList: require('mail.messaging.component.AttachmentList'),
    DropZone: require('mail.messaging.component.DropZone'),
    FileUploader: require('mail.messaging.component.FileUploader'),
};
const useDragVisibleDropZone = require('mail.messaging.component_hook.useDragVisibleDropZone');
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useDispatch, useRef } = owl.hooks;

class AttachmentBox extends Component {

    /**
     * @param {...any} args
     * @override
     */
    constructor(...args) {
        super(...args);
        this.isDropZoneVisible = useDragVisibleDropZone();
        this.storeDispatch = useDispatch();
        this.storeProps = useStore((state, props) => {
            const thread = state.threads[props.threadLocalId];
            return {
                attachmentLocalIds: thread ? thread.attachmentLocalIds : [],
                threadId: thread ? thread.id : undefined,
                threadModel: thread ? thread._model : undefined
            };
        });
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
            threadLocalIds: [this.props.threadLocalId],
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

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
    components,
    props: {
        threadLocalId: String,
    },
    template: 'mail.messaging.component.AttachmentBox',
});

return AttachmentBox;

});
