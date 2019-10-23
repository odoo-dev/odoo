odoo.define('mail.component.Composer', function (require) {
'use strict';

const AttachmentList = require('mail.component.AttachmentList');
const DropZone = require('mail.component.DropZone');
const EmojisButton = require('mail.component.EmojisButton');
const TextInput = require('mail.component.ComposerTextInput');

const core = require('web.core');

const { Component, useState } = owl;
const { useDispatch, useGetters, useRef, useStore } = owl.hooks;

class Composer extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        /**
         * Unique local data used to track file uploads from this component.
         * This is used to intercept event telling that the files have been
         * uploaded.
         */
        this.fileuploadId = _.uniqueId('o_Composer_fileupload');
        this.state = useState({
            /**
             * Determine whether the "all" suggested recipients should be
             * displayed. By default it shows just a few of them, but the user
             * can display all of them.
             */
            hasAllSuggestedRecipients: false,
            /**
             * Determine whether there is a dropzone for files. This is present
             * only when dragging files, and dragging files can be dropped in
             * order to upload them.
             */
            hasDropZone: false,
            /**
             * Determine whether there are some text content. Useful to prevent
             * user to post something when there are no text content and no
             * attachments.
             */
            hasTextInputContent: false,
        });
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const storeComposerState = _.defaults({}, state.composers[props.id], {
                attachmentLocalIds: [],
            });
            return Object.assign({}, storeComposerState, {
                fullSuggestedRecipients: (props.suggestedRecipients || []).map(recipient => {
                    return Object.assign({}, recipient, {
                        partner: state.partners[recipient.partnerLocalId],
                    });
                }),
                isMobile: state.isMobile,
                thread: state.threads[props.threadLocalId],
            });
        });
        /**
         * Reference of the emoji button. Useful to include emoji popover as
         * click "inside" the composer for the prop `isDiscardOnClickAway`.
         */
        this._emojisButtonRef = useRef('emojisButton');
        /**
         * Reference of the file input. Useful to programmatically prompts the
         * browser file uploader.
         */
        this._fileInputRef = useRef('fileInput');
        /**
         * Reference of the dropzone.
         */
        this._dropzoneRef = useRef('dropzone');
        /**
         * Reference of the text input component.
         */
        this._textInputRef = useRef('textInput');
        /**
         * Counts how many drag enter/leave happened globally. This is the only
         * way to know if a file has been dragged out of the browser window.
         */
        this._dragCount = 0;
        /**
         * Tracked focus counter from props. Useful to determine whether it
         * should auto focus this composer when patched.
         */
        this._focusCount = 0;
        this._onAttachmentUploaded = this._onAttachmentUploaded.bind(this);
        this._onClickCaptureGlobal = this._onClickCaptureGlobal.bind(this);
        this._onDragenterCaptureGlobal = this._onDragenterCaptureGlobal.bind(this);
        this._onDragleaveCaptureGlobal = this._onDragleaveCaptureGlobal.bind(this);
        this._onDropCaptureGlobal = this._onDropCaptureGlobal.bind(this);
    }

    mounted() {
        $(window).on(this.fileuploadId, this._onAttachmentUploaded);
        if (this.props.isFocusOnMount) {
            this.focus();
        }
        if (this.env.store.state.composers[this.props.id]) {
            throw new Error(`Already some store data in composer with id '${this.props.id}'`);
        }
        this.storeDispatch('createComposer', this.props.id, {
            attachmentLocalIds: this.props.initialAttachmentLocalIds || [],
        });
        document.addEventListener('click', this._onClickCaptureGlobal, true);
        document.addEventListener('dragenter', this._onDragenterCaptureGlobal, true);
        document.addEventListener('dragleave', this._onDragleaveCaptureGlobal, true);
        document.addEventListener('drop', this._onDropCaptureGlobal, true);
    }

    /**
     * @param {Object} nextProps
     * @param {string} nextProps.id
     */
    willUpdateProps(nextProps) {
        if (nextProps.id !== this.props.id) {
            throw new Error("'id' in props changed. Parent should keep same 'id' for same instance of component");
        }
    }

    patched() {
        if (this._focusCount !== this.props.focusCounter) {
            this.focus();
        }
        this._focusCount = this.props.focusCounter;
    }

    willUnmount() {
        this.storeDispatch('deleteComposer', this.props.id);
        $(window).off(this.fileuploadId, this._onAttachmentUploaded);
        document.removeEventListener('click', this._onClickCaptureGlobal, true);
        document.removeEventListener('dragenter', this._onDragenterCaptureGlobal, true);
        document.removeEventListener('dragleave', this._onDragleaveCaptureGlobal, true);
        document.removeEventListener('drop', this._onDropCaptureGlobal, true);
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * Get the current partner image URL.
     *
     * @return {string}
     */
    get currentPartnerAvatar() {
        const avatar = this.env.session.uid > 0
            ? this.env.session.url('/web/image', {
                    field: 'image_128',
                    id: this.env.session.uid,
                    model: 'res.users',
                })
            : '/web/static/src/img/user_menu_avatar.png';
        return avatar;
    }

    /**
     * Determine whether composer should display a footer.
     *
     * @return {boolean}
     */
    get hasFooter() {
        return this.storeProps.attachmentLocalIds.length > 0;
    }

    /**
     * Determine whether the composer should display a header.
     *
     * @return {boolean}
     */
    get hasHeader() {
        return (
            (this.props.hasThreadName && this.storeProps.thread) ||
            (this.props.hasFollowers && !this.props.isLog)
        );
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Focus the composer.
     */
    focus() {
        if (this.storeProps.isMobile) {
            this.el.scrollIntoView();
        }
        this._textInputRef.comp.focus();
    }

    /**
     * Focusout the composer.
     */
    focusout() {
        this._textInputRef.comp.focusout();
    }

    /**
     * Get state of composer, which is basically text input content and
     * attachments. Useful to restore the state on another composer component.
     *
     * @return {Object}
     */
    getState() {
        return {
            attachmentLocalIds: this.storeProps.attachmentLocalIds,
            textInputHtmlContent: this._textInputRef.comp.getHtmlContent(),
        };
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Post a message in the composer on related thread.
     *
     * @private
     */
    async _postMessage() {
        // TODO: take suggested recipients into account
        try {
            await this.storeDispatch('postMessageOnThread', this.props.threadLocalId, {
                attachmentLocalIds: this.storeProps.attachmentLocalIds,
                htmlContent: this._textInputRef.comp.getHtmlContent(),
                isLog: this.props.isLog,
                threadCacheLocalId: this.props.threadCacheLocalId,
            });
            this._textInputRef.comp.reset();
            this.storeDispatch('unlinkAttachmentsFromComposer', this.props.id);
            // TODO: we might need to remove trigger and use the store to wait for
            // the post rpc to be done
            this.trigger('o-message-posted');
        } catch (err) {
            // ignore error
        }
    }

    /**
     * Upload files.
     *
     * @private
     * @param {FileList|Array} files
     * @return {Promise}
     */
    async _uploadFiles(files) {
        for (const file of files) {
            const attachment = this.storeProps.attachmentLocalIds
                .map(localId => this.env.store.state.attachments[localId])
                .find(attachment =>
                    attachment.name === file.name && attachment.size === file.size);
            // if the file already exists, delete the file before upload
            if (attachment) {
                this.storeDispatch('unlinkAttachment', attachment.localId);
            }
        }
        for (const file of files) {
            const attachmentLocalId = this.storeDispatch('createAttachment', {
                filename: file.name,
                isTemporary: true,
                name: file.name,
            });
            this.storeDispatch('linkAttachmentToComposer', this.props.id, attachmentLocalId);
        }
        let formData = new window.FormData();
        formData.append('callback', this.fileuploadId);
        formData.append('csrf_token', core.csrf_token);
        formData.append('id', '0');
        formData.append('model', 'mail.compose.message');
        for (const file of files) {
            // removing existing key with blank data and appending again with
            // file info. In Safari, existing key will not be updated when
            // appended with new file.
            formData.delete('ufile');
            formData.append('ufile', file, file.name);
            const response = await window.fetch('/web/binary/upload_attachment', {
                body: formData,
                method: 'POST',
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
     * Called when some uploading attachments in the composer have been
     * uploaded.
     *
     * @private
     * @param {jQuery.Event} ev
     * @param {...Object} fileData
     */
    _onAttachmentUploaded(ev, ...filesData) {
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
                    this.storeDispatch('deleteAttachment', temporaryAttachmentLocalId);
                }
                return;
            }
            this.storeDispatch('createAttachment', {
                filename,
                id,
                mimetype,
                name,
                size,
            });
        }
    }

    /**
     * Called when there are changes in the file input.
     *
     * @private
     * @param {Event} ev
     */
    async _onChangeAttachment(ev) {
        await this._uploadFiles(ev.target.files);
    }

    /**
     * Called when clicking on attachment button.
     *
     * @private
     */
    _onClickAddAttachment() {
        this._fileInputRef.el.click();
        this.focus();
    }

    /**
     * Discards the composer when clicking away from the Inbox reply in discuss.
     * TODO SEB maybe move this in discuss.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        // in discuss app: prevents discarding the composer when clicking away
        if (!this.props.isDiscardOnClickAway) {
            return;
        }
        // prevents discarding when clicking on self (on discuss and not on discuss)
        if (this.el.contains(ev.target)) {
            return;
        }
        // emoji popover is outside but should be considered inside
        if (this._emojisButtonRef.comp.isInsideEventTarget(ev.target)) {
            return;
        }
        this.trigger('o-discarded');
    }

    /**
     * Called when clicking on "expand" button.
     *
     * @private
     */
    async _onClickFullComposer() {
        const attachmentIds = this.storeProps.attachmentLocalIds
            .map(localId => this.env.store.state.attachments[localId].res_id);

        const context = {
            // default_parent_id: this.id,
            default_body: this._textInput.comp.getHtmlContent(),
            default_attachment_ids: attachmentIds,
            // default_partner_ids: partnerIds,
            default_is_log: this.props.isLog,
            mail_post_autofollow: true,
        };

        // if (this.context.default_model && this.context.default_res_id) {
        //     context.default_model = this.context.default_model;
        //     context.default_res_id = this.context.default_res_id;
        // }

        const action = {
            type: 'ir.actions.act_window',
            res_model: 'mail.compose.message',
            view_mode: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: context,
        };
        await this.env.do_action(action);
        this.trigger('o-full-composer-opened');
    }

    /**
     * Called when clicking on "discard" button.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDiscard(ev) {
        this.trigger('o-discarded');
    }

    /**
     * Called when clicking on "send" button.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickSend(ev) {
        if (
            this._textInput.comp.isEmpty() &&
            this.storeProps.attachmentLocalIds.length === 0
        ) {
            return;
        }
        ev.stopPropagation();
        this._postMessage();
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onDiscardInput(ev) {
        this.trigger('o-discarded');
    }

    /**
     * Shows the dropzone when entering the browser window, to let the user know
     * where he can drop its file.
     * Avoids changing state when entering inner dropzones.
     *
     * @private
     * @param {DragEvent} ev
     */
    _onDragenterCaptureGlobal(ev) {
        if (this._dragCount === 0) {
            this.state.hasDropZone = true;
        }
        this._dragCount++;
    }

    /**
     * Hides the dropzone when leaving the browser window.
     * Avoids changing state when leaving inner dropzones.
     *
     * @private
     * @param {DragEvent} ev
     */
    _onDragleaveCaptureGlobal(ev) {
        this._dragCount--;
        if (this._dragCount === 0) {
            this.state.hasDropZone = false;
        }
    }

    /**
     * Hides the dropzone when dropping a file outside the dropzone.
     * This is necessary because the leave event is not triggered in that case.
     *
     * When dropping inside the dropzone, it will be hidden but only after the
     * file has been processed in `_onDropZoneFilesDropped`.
     *
     * @private
     * @param {DragEvent} ev
     */
    _onDropCaptureGlobal(ev) {
        this._dragCount = 0;
        if (!this._dropzoneRef.comp.contains(ev.target)) {
            this.state.hasDropZone = false;
        }
    }

    /**
     * Called when some files have been dropped in the dropzone.
     *
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {FileList} ev.detail.files
     */
    _onDropZoneFilesDropped(ev) {
        this._uploadFiles(ev.detail.files);
        this.state.hasDropZone = false;
    }

    /**
     * Called when selection an emoji from the emoji popover (from the emoji
     * button).
     *
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.unicode
     */
    _onEmojiSelection(ev) {
        this._textInputRef.comp.insertTextContent(ev.detail.unicode);
    }

    /**
     * @private
     */
    _onInputTextInput() {
        this.state.hasTextInputContent = !this._textInputRef.comp.isEmpty();
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onPasteTextInput(ev) {
        if (!ev.clipboardData || !ev.clipboardData.files) {
            return;
        }
        this._uploadFiles(ev.clipboardData.files);
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onTextInputKeydownEnter(ev) {
        if (
            this._textInputRef.comp.isEmpty() &&
            this.storeProps.attachmentLocalIds.length === 0
        ) {
            return;
        }
        this._postMessage();
    }

    /**
     * @private
     */
    _onShowLessSuggestedRecipients() {
        this.state.hasAllSuggestedRecipients = false;
    }

    /**
     * @private
     */
    _onShowMoreSuggestedRecipients() {
        this.state.hasAllSuggestedRecipients = true;
    }
}

Composer.components = { AttachmentList, DropZone, EmojisButton, TextInput };

Composer.defaultProps = {
    areButtonsInline: true,
    attachmentLocalIds: [],
    focusCounter: 0,
    hasCurrentPartnerAvatar: true,
    hasDiscardButton: false,
    hasFollowers: false,
    hasSendButton: true,
    hasThreadName: false,
    isDiscardOnClickAway: false,
    isExpandable: false,
    isFocusOnMount: false,
    isLog: false,
};

Composer.props = {
    areButtonsInline: {
        type: Boolean,
        optional: true,
    },
    attachmentLocalIds: {
        type: Array,
        element: String,
        optional: true,
    },
    attachmentsLayout: {
        type: String,
        optional: true,
    },
    focusCounter: {
        type: Number,
        optional: true,
    },
    hasCurrentPartnerAvatar: {
        type: Boolean,
        optional: true,
    },
    hasDiscardButton: {
        type: Boolean,
        optional: true,
    },
    hasFollowers: {
        type: Boolean,
        optional: true,
    },
    hasSendButton: {
        type: Boolean,
        optional: true,
    },
    hasThreadName: {
        type: Boolean,
        optional: true,
    },
    haveAttachmentsLabelForCardLayout: {
        type: Boolean,
        optional: true,
    },
    id: String,
    initialAttachmentLocalIds: {
        type: Array,
        element: String,
        optional: true,
    },
    initialTextInputHtmlContent: {
        type: String,
        optional: true,
    },
    isDiscardOnClickAway: {
        type: Boolean,
        optional: true,
    },
    isExpandable: {
        type: Boolean,
        optional: true,
    },
    isFocusOnMount: {
        type: Boolean,
        optional: true,
    },
    isLog: {
        type: Boolean,
        optional: true,
    },
    threadCacheLocalId: {
        type: String,
        optional: true,
    },
    threadLocalId: {
        type: String,
        optional: true,
    },
};

Composer.template = 'mail.component.Composer';

return Composer;

});
