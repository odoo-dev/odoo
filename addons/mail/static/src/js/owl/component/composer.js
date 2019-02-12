odoo.define('mail.component.Composer', function (require) {
'use strict';

const AttachmentList = require('mail.component.AttachmentList');
const EmojisButton = require('mail.component.EmojisButton');
const TextInput = require('mail.component.ComposerTextInput');

const core = require('web.core');

class Composer extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.components = { AttachmentList, EmojisButton, TextInput };
        this.fileuploadId = _.uniqueId('o_Composer_fileupload');
        this.state = {
            hasAllSuggestedRecipients: false,
            hasTextInputContent: false,
        };
        this.template = 'mail.component.Composer';
        /**
         * Tracked focus counter from props. Useful to determine whether it
         * should auto focus this composer when patched.
         */
        this._focusCounter = 0;
    }

    mounted() {
        this._attachmentUploadedEventListener = (...args) => this._onAttachmentUploaded(...args);
        $(window).on(this.fileuploadId, this._attachmentUploadedEventListener);
        if (this.props.isFocusOnMount) {
            this.focus();
        }
        if (this.env.store.state.composers[this.props.id]) {
            throw new Error(`Already some store data in composer with id '${this.props.id}'`);
        }
        this.env.store.commit('createComposer', this.props.id, {
            attachmentLocalIds: [],
        });
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
        if (this._focusCounter !== this.props.focusCounter) {
            this.focus();
        }
        this._focusCounter = this.props.focusCounter;
    }

    willUnmount() {
        this.env.store.commit('deleteComposer', this.props.id);
        $(window).off(this.fileuploadId, this._attachmentUploadedEventListener);
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @return {string}
     */
    get currentPartnerAvatar() {
        const avatar = this.env.session.uid > 0
            ? this.env.session.url('/web/image', {
                    field: 'image_64',
                    id: this.env.session.uid,
                    model: 'res.users',
                })
            : '/web/static/src/img/user_menu_avatar.png';
        return avatar;
    }

    /**
     * @return {boolean}
     */
    get hasFooter() {
        return this.props.attachmentLocalIds.length > 0;
    }

    /**
     * @return {boolean}
     */
    get hasHeader() {
        return (
            (this.props.hasThreadName && this.props.thread) ||
            (this.props.hasFollowers && !this.props.isLog)
        );
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    focus() {
        this.el.scrollIntoView();
        this.refs.textInput.focus();
    }

    focusout() {
        this.refs.textInput.focusout();
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _postMessage() {
        // TODO: take suggested recipients into account
        this.env.store.dispatch('postMessageOnThread', this.props.threadLocalId, {
            attachmentLocalIds: this.props.attachmentLocalIds,
            content: this.refs.textInput.getValue(),
            isLog: this.props.isLog,
            threadCacheLocalId: this.props.threadCacheLocalId,
        });
        this.refs.textInput.resetValue();
        this.env.store.commit('unlinkAttachmentsFromComposer', this.props.id);

        // TODO: we might need to remove trigger and use the store to wait for
        // the post rpc to be done
        this.trigger('o-message-posted');
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
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
                    this.env.store.commit('deleteAttachment', temporaryAttachmentLocalId);
                }
                return;
            }
            this.env.store.commit('createAttachment', {
                filename,
                id,
                mimetype,
                name,
                size,
            });
        }
    }

    /**
     * @private
     * @param {Event} ev
     */
    async _onChangeAttachment(ev) {
        const files = ev.target.files;
        for (const file of files) {
            const attachment = this.props.attachmentLocalIds
                .map(localId => this.env.store.state.attachments[localId])
                .find(attachment =>
                    attachment.name === file.name && attachment.size === file.size);
            // if the files already exits, delete the file before upload
            if (attachment) {
                this.env.store.dispatch('unlinkAttachment', attachment.localId);
            }
        }
        for (const file of files) {
            const attachmentLocalId = this.env.store.commit('createAttachment', {
                filename: file.name,
                isTemporary: true,
                name: file.name,
            });
            this.env.store.commit('linkAttachmentToComposer', this.props.id, attachmentLocalId);
        }
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
        this.refs.fileInput.value = '';
    }

    /**
     * @private
     */
    _onClickAddAttachment() {
        this.refs.fileInput.click();
        this.focus();
    }

    /**
     * @private
     */
    async _onClickFullComposer() {
        const attachmentIds = this.props.attachmentLocalIds
            .map(localId => this.env.store.state.attachments[localId].res_id);

        var context = {
            // default_parent_id: this.id,
            default_body: this.refs.textInput.getValue(),
            default_attachment_ids: attachmentIds,
            // default_partner_ids: partnerIds,
            default_is_log: this.props.isLog,
            mail_post_autofollow: true,
        };

        // if (this.context.default_model && this.context.default_res_id) {
        //     context.default_model = this.context.default_model;
        //     context.default_res_id = this.context.default_res_id;
        // }

        var action = {
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
     * @private
     * @param {MouseEvent} ev
     */
    _onClickDiscard(ev) {
        this.trigger('o-discarded');
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickSend(ev) {
        if (!this.refs.textInput.getValue()) {
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
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.unicode
     */
    _onEmojiSelection(ev) {
        this.refs.textInput.insert(ev.detail.unicode);
    }

    /**
     * @private
     */
    _onInputTextInput() {
        this.state.hasTextInputContent = this.refs.textInput.getValue().trim().length !== 0;
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onTextInputKeydownEnter(ev) {
        if (
            this.refs.textInput.getValue().length === 0 &&
            this.props.attachmentLocalIds.length === 0
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

Composer.defaultProps = {
    areButtonsInline: true,
    attachmentLocalIds: [],
    focusCounter: 0,
    hasCurrentPartnerAvatar: true,
    hasDiscardButton: false,
    hasFollowers: false,
    hasSendButton: true,
    hasThreadName: false,
    isExpandable: false,
    isFocusOnMount: false,
    isLog: false,
    suggestedRecipients: [],
};

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.id
 * @param {Object[]} [ownProps.suggestedRecipients=[]]
 * @param {string} [ownProps.threadLocalId]
 */
Composer.mapStoreToProps = function (
    state,
    { id, suggestedRecipients=[], threadLocalId }
) {
    return {
        ...state.composers[id],
        fullSuggestedRecipients: suggestedRecipients.map(recipient => {
            return {
                ...recipient,
                partner: state.partners[recipient.partnerLocalId],
            };
        }),
        isMobile: state.isMobile,
        thread: state.threads[threadLocalId],
    };
};

Composer.props = {
    areButtonsInline: Boolean,
    attachmentsLayout: {
        type: String,
        optional: true,
    },
    focusCounter: Number,
    hasCurrentPartnerAvatar: Boolean,
    hasDiscardButton: Boolean,
    hasFollowers: Boolean,
    hasSendButton: Boolean,
    hasThreadName: Boolean,
    haveAttachmentsLabelForCardLayout: {
        type: Boolean,
        optional: true,
    },
    id: String,
    isExpandable: Boolean,
    isFocusOnMount: Boolean,
    isLog: Boolean,
    isMobile: Boolean,
    suggestedRecipients: {
        type: Array,
        element: {
            type: Object,
            shape: {
                checked: Boolean,
                partnerLocalId: String,
                reason: String,
            },
        },
        optional: true,
    },
    thread: {
        type: Object, // {mail.store.model.Thread}
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

return Composer;

});
