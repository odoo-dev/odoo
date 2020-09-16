/** @odoo-module alias=mail.components.Composer **/

import useDragVisibleDropZone from 'mail.componentHooks.useDragVisibleDropZone';
import useUpdate from 'mail.componentHooks.useUpdate';
import usingModels from 'mail.componentMixins.usingModels';
import isEventHandled from 'mail.utils.isEventHandled';
import markEventHandled from 'mail.utils.markEventHandled';

const { Component, QWeb } = owl;
const { useRef } = owl.hooks;

class Composer extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useUpdate({ func: () => this._update() });
        this.isDropZoneVisible = useDragVisibleDropZone();
        /**
         * Reference of the emoji popover. Useful to include emoji popover as
         * contained "inside" the composer.
         */
        this._emojisPopoverRef = useRef('emojisPopover');
        /**
         * Reference of the file uploader.
         * Useful to programmatically prompts the browser file uploader.
         */
        this._fileUploaderRef = useRef('fileUploader');
        /**
         * Reference of the text input component.
         */
        this._textInputRef = useRef('textInput');
        /**
         * Reference of the subject input. Useful to set content.
         */
        this._subjectRef = useRef('subject');
        this._onClickCaptureGlobal = this._onClickCaptureGlobal.bind(this);
    }

    mounted() {
        document.addEventListener('click', this._onClickCaptureGlobal, true);
    }

    willUnmount() {
        document.removeEventListener('click', this._onClickCaptureGlobal, true);
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Returns whether the given node is self or a children of self, including
     * the emoji popover.
     *
     * @param {Node} node
     * @returns {boolean}
     */
    contains(node) {
        // emoji popover is outside but should be considered inside
        const emojisPopover = this._emojisPopoverRef.comp;
        if (emojisPopover && emojisPopover.contains(node)) {
            return true;
        }
        return this.el.contains(node);
    }

    /**
     * Get the current partner image URL.
     *
     * @returns {string}
     */
    get currentPartnerAvatar() {
        const avatar = this.env.services.model.messaging.currentUser(this)
            ? this.env.session.url(
                '/web/image',
                {
                    field: 'image_128',
                    id: this.env.services.model.messaging.currentUser(this).id(this),
                    model: 'res.users',
                },
            )
            : '/web/static/src/img/user_menu_avatar.png';
        return avatar;
    }

    /**
     * Focus the composer.
     */
    focus() {
        if (this.env.services.model.messaging.device(this).isMobile(this)) {
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
     * Determine whether composer should display a footer.
     *
     * @returns {boolean}
     */
    get hasFooter() {
        return (
            this.hasThreadTyping ||
            this.composer.attachments(this).length > 0 ||
            !this.isCompact
        );
    }

    /**
     * Determine whether the composer should display a header.
     *
     * @returns {boolean}
     */
    get hasHeader() {
        return (
            (this.hasThreadName && this.composer.thread(this)) ||
            (this.hasFollowers && !this.composer.isLog(this))
        );
    }

    /**
     * Get an object which is passed to FileUploader component to be used when
     * creating attachment.
     *
     * @returns {Object}
     */
    get newAttachmentExtraData() {
        return {
            composers: this.env.services.action.dispatch(
                'RecordFieldCommand/replace',
                this.composer,
            ),
        };
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Post a message in the composer on related thread.
     *
     * Posting of the message could be aborted if it cannot be posted like if there are attachments
     * currently uploading or if there is no text content and no attachments.
     *
     * @private
     */
    async _postMessage() {
        if (!this.composer.canPostMessage(this)) {
            if (this.composer.hasUploadingAttachment(this)) {
                this.env.services['notification'].notify({
                    message: this.env._t("Please wait while the file is uploading."),
                    type: 'warning',
                });
            }
            return;
        }
        await this.env.services.action.dispatch(
            'Composer/postMessage',
            this.composer,
        );
        // TODO: we might need to remove trigger and use the store to wait for the post rpc to be done
        // task-2252858
        this.trigger('o-message-posted');
    }

    /**
     * @private
     */
    _update() {
        if (this.props.isDoFocus) {
            this.focus();
        }
        if (!this.composer) {
            return;
        }
        if (this._subjectRef.el) {
            this._subjectRef.el.value = this.composer.subjectContent(this);
        }
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * Called when clicking on attachment button.
     *
     * @private
     */
    _onClickAddAttachment() {
        this._fileUploaderRef.comp.openBrowserFileUploader();
        if (!this.env.services.model.messaging.device(this).isMobile(this)) {
            this.focus();
        }
    }

    /**
     * Discards the composer when clicking away.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickCaptureGlobal(ev) {
        if (this.contains(ev.target)) {
            return;
        }
        this.env.services.action.dispatch(
            'Composer/discard',
            this.composer,
        );
    }

    /**
     * Called when clicking on "expand" button.
     *
     * @private
     */
    _onClickFullComposer() {
        this.env.services.action.dispatch(
            'Composer/openFullComposer',
            this.composer,
        );
    }

    /**
     * Called when clicking on "discard" button.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDiscard(ev) {
        this.env.services.action.dispatch(
            'Composer/discard',
            this.composer,
        );
    }

    /**
     * Called when clicking on "send" button.
     *
     * @private
     */
    _onClickSend() {
        this._postMessage();
        this.focus();
    }

    /**
     * @private
     */
    _onComposerSuggestionClicked() {
        this.focus();
    }

    /**
     * @private
     */
    _onComposerTextInputSendShortcut() {
        this._postMessage();
    }

    /**
     * Called when some files have been dropped in the dropzone.
     *
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
        ev.stopPropagation();
        this._textInputRef.comp.saveStateInStore();
        this.env.services.action.dispatch(
            'Composer/insertIntoTextInput',
            this.composer,
            ev.detail.unicode,
        );
        if (!this.env.services.model.messaging.device(this).isMobile(this)) {
            this.focus();
        }
    }

    /**
     * @private
     */
    _onInputSubject() {
        this.env.services.action.dispatch(
            'Record/update',
            this.composer,
            { subjectContent: this._subjectRef.el.value },
        );
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydown(ev) {
        if (ev.key === 'Escape') {
            if (isEventHandled(ev, 'ComposerTextInput.closeSuggestions')) {
                return;
            }
            if (isEventHandled(ev, 'Composer.closeEmojisPopover')) {
                return;
            }
            ev.preventDefault();
            this.env.services.action.dispatch(
                'Composer/discard',
                this.composer,
            );
        }
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onKeydownEmojiButton(ev) {
        if (ev.key === 'Escape') {
            if (this._emojisPopoverRef.comp) {
                this._emojisPopoverRef.comp.close();
                this.focus();
                markEventHandled(ev, 'Composer.closeEmojisPopover');
            }
        }
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    async _onPasteTextInput(ev) {
        if (!ev.clipboardData || !ev.clipboardData.files) {
            return;
        }
        await this._fileUploaderRef.comp.uploadFiles(ev.clipboardData.files);
    }

}

Object.assign(Composer, {
    defaultProps: {
        attachments: [],
        hasCurrentPartnerAvatar: true,
        hasDiscardButton: false,
        hasFollowers: false,
        hasSendButton: true,
        hasThreadName: false,
        hasThreadTyping: false,
        isCompact: true,
        isDoFocus: false,
        isExpandable: false,
    },
    props: {
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
        attachmentsDetailsMode: {
            type: String,
            optional: true,
        },
        composer: {
            type: Object,
            validate(p) {
                if (p.constructor.modelName !== 'Composer') {
                    return false;
                }
                return true;
            },
        },
        hasCurrentPartnerAvatar: Boolean,
        hasDiscardButton: Boolean,
        hasFollowers: Boolean,
        hasMentionSuggestionsBelowPosition: {
            type: Boolean,
            optional: true,
        },
        hasSendButton: Boolean,
        hasThreadName: Boolean,
        hasThreadTyping: Boolean,
        /**
         * Determines whether this should become focused.
         */
        isDoFocus: Boolean,
        showAttachmentsExtensions: {
            type: Boolean,
            optional: true,
        },
        showAttachmentsFilenames: {
            type: Boolean,
            optional: true,
        },
        isCompact: Boolean,
        isExpandable: Boolean,
        /**
         * If set, keyboard shortcuts from text input to send message.
         * If not set, will use default values from `ComposerTextInput`.
         */
        textInputSendShortcuts: {
            type: Array,
            element: String,
            optional: true,
        },
    },
    template: 'mail.Composer',
});

QWeb.registerComponent('Composer', Composer);

export default Composer;
