odoo.define('mail.messaging.component.Message', function (require) {
'use strict';

const components = {
    AttachmentList: require('mail.messaging.component.AttachmentList'),
    ModerationBanDialog: require('mail.messaging.component.ModerationBanDialog'),
    ModerationDiscardDialog: require('mail.messaging.component.ModerationDiscardDialog'),
    ModerationRejectDialog: require('mail.messaging.component.ModerationRejectDialog'),
    PartnerImStatusIcon: require('mail.messaging.component.PartnerImStatusIcon'),
};
const useStore = require('mail.messaging.component_hook.useStore');
const { timeFromNow } = require('mail.utils');

const { _lt } = require('web.core');
const { getLangDatetimeFormat } = require('web.time');

const { Component, useState } = owl;
const { useDispatch, useGetters, useRef } = owl.hooks;

const READ_MORE = _lt("read more");
const READ_LESS = _lt("read less");

class Message extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
            // Determine if the moderation ban dialog is displayed.
            hasModerationBanDialog: false,
            // Determine if the moderation discard dialog is displayed.
            hasModerationDiscardDialog: false,
            // Determine if the moderation reject dialog is displayed.
            hasModerationRejectDialog: false,
            /**
             * Determine whether the message is clicked. When message is in
             * clicked state, it keeps displaying the commands.
             */
            isClicked: false,
            /**
             * Time elapsed from message datetime to current datetime.
             */
            timeElapsed: null,
        });
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const message = state.messages[props.messageLocalId];
            const attachmentLocalIds = message.attachmentLocalIds;
            const author = state.partners[message.authorLocalId];
            const originThread = state.threads[message.originThreadLocalId];
            const thread = state.threads[props.threadLocalId];
            const hasCheckbox = this.storeGetters.hasMessageCheckbox(message.localId);
            const isChecked = this.storeGetters.isMessageChecked(
                message.localId,
                thread.localId,
                props.threadStringifiedDomain
            );
            return {
                attachmentLocalIds,
                author,
                hasCheckbox,
                isChecked,
                isMobile: state.isMobile,
                message,
                originThread,
                // used through isPartnerRoot getter
                partnerRootLocalId: state.partnerRootLocalId,
                thread,
            };
        });
        /**
         * Reference to the content of the message.
         */
        this._contentRef = useRef('content');
        /**
         * To get checkbox state.
         */
        this._checkboxRef = useRef('checkbox');
        /**
         * Id of setInterval used to auto-update time elapsed of message at
         * regular time.
         */
        this._intervalId = undefined;
    }

    mounted() {
        this.state.timeElapsed = timeFromNow(this.message.date);
        this._insertReadMoreLess($(this._contentRef.el));
    }

    willUnmount() {
        clearInterval(this._intervalId);
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {string}
     */
    get avatar() {
        if (
            this.storeProps.author &&
            this.storeGetters.isPartnerRoot(this.storeProps.author.localId)
        ) {
            return '/mail/static/src/img/odoobot.png';
        } else if (this.storeProps.author) {
            // TODO FIXME for public user this might not be accessible
            // we should probably use the correspondig attachment id + access token
            // or create a dedicated route to get message image, checking the access right of the message
            return `/web/image/res.partner/${this.storeProps.author.id}/image_128`;
        } else if (this.message.message_type === 'email') {
            return '/mail/static/src/img/email_icon.png';
        }
        return '/mail/static/src/img/smiley/avatar.jpg';
    }

    /**
     * Get the date time of the message at current user locale time.
     *
     * @returns {string}
     */
    get datetime() {
        return this.message.date.format(getLangDatetimeFormat());
    }

    /**
     * Determine whether author redirect feature is enabled on message.
     * Click on message author should redirect to author.
     *
     * @returns {boolean}
     */
    get hasAuthorRedirect() {
        if (!this.props.hasAuthorRedirect) {
            return false;
        }
        if (!this.storeProps.author) {
            return false;
        }
        if (this.storeProps.author.id === this.env.session.partner_id) {
            return false;
        }
        return true;
    }

    /**
     * Determine whether the message origin thread is the same as the context
     * of displaying this message. In other word, if the enclosing thread
     * component of this message component is linked to the origin thread of
     * this message, then the origin is the same.
     *
     * @returns {boolean}
     */
    get hasDifferentOriginThread() {
        return (
            this.storeProps.originThread &&
            this.storeProps.originThread !== this.storeProps.thread
        );
    }

    /**
     * @returns {string[]}
     */
    get imageAttachmentLocalIds() {
        if (!this.message.attachmentLocalIds) {
            return [];
        }
        return this.message.attachmentLocalIds.filter(attachmentLocalId =>
            this.storeGetters.attachmentFileType(attachmentLocalId) === 'image'
        );
    }

    /**
     * Determine whether the message is starred.
     *
     * @returns {boolean}
     */
    get isStarred() {
        return this.message.threadLocalIds.includes('mail.box_starred');
    }

    /**
     * @returns {mail.messaging.entity.Message}
     */
    get message() {
        return this.storeProps.message;
    }

    /**
     * @returns {string[]}
     */
    get nonImageAttachmentLocalIds() {
        if (!this.message.attachmentLocalIds) {
            return [];
        }
        return this.message.attachmentLocalIds.filter(attachmentLocalId =>
            this.storeGetters.attachmentFileType(attachmentLocalId) !== 'image'
        );
    }

    /**
     * Get the shorttime format of the message date.
     *
     * @returns {string}
     */
    get shortTime() {
        return this.message.date.format('hh:mm');
    }

    /**
     * @returns {string}
     */
    get timeElapsed() {
        clearInterval(this._intervalId);
        this._intervalId = setInterval(() => {
            this.state.timeElapsed = timeFromNow(this.message.date);
        }, 60 * 1000);
        return this.state.timeElapsed;
    }

    /**
     * @returns {Object}
     */
    get trackingValues() {
        return this.message.tracking_value_ids.map(trackingValue => {
            const value = Object.assign({}, trackingValue);
            value.changed_field = _.str.sprintf(this.env._t("%s:"), value.changed_field);
            if (value.field_type === 'datetime') {
                if (value.old_value) {
                    value.old_value =
                        moment.utc(value.old_value).local().format('LLL');
                }
                if (value.new_value) {
                    value.new_value =
                        moment.utc(value.new_value).local().format('LLL');
                }
            } else if (value.field_type === 'date') {
                if (value.old_value) {
                    value.old_value =
                        moment(value.old_value).local().format('LL');
                }
                if (value.new_value) {
                    value.new_value =
                        moment(value.new_value).local().format('LL');
                }
            }
            return value;
        });
    }

    /**
     * Tell whether the bottom of this message is visible or not.
     *
     * @param {Object} param0
     * @param {integer} [offset=0]
     * @returns {boolean}
     */
    isBottomVisible({ offset=0 }={}) {
        const elRect = this.el.getBoundingClientRect();
        if (!this.el.parentNode) {
            return false;
        }
        const parentRect = this.el.parentNode.getBoundingClientRect();
        // bottom with (double) 10px offset
        return (
            elRect.bottom < parentRect.bottom + offset &&
            parentRect.top < elRect.bottom + offset
        );
    }

    /**
     * Tell whether the message is partially visible on browser window or not.
     *
     * @returns {boolean}
     */
    isPartiallyVisible() {
        const elRect = this.el.getBoundingClientRect();
        if (!this.el.parentNode) {
            return false;
        }
        const parentRect = this.el.parentNode.getBoundingClientRect();
        // intersection with 5px offset
        return (
            elRect.top < parentRect.bottom + 5 &&
            parentRect.top < elRect.bottom + 5
        );
    }

    /**
     * Make this message viewable in its enclosing scroll environment (usually
     * message list).
     *
     * @param {Object} [param0={}]
     * @param {string} [param0.behavior='auto']
     * @param {string} [param0.block='end']
     * @returns {Promise}
     */
    async scrollIntoView({ behavior='auto', block='end' }={}) {
        this.el.scrollIntoView({
            behavior,
            block,
            inline: 'nearest',
        });
        if (behavior === 'smooth') {
            return new Promise(resolve => setTimeout(resolve, 500));
        } else {
            return Promise.resolve();
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Modifies the message to add the 'read more/read less' functionality
     * All element nodes with 'data-o-mail-quote' attribute are concerned.
     * All text nodes after a ``#stopSpelling`` element are concerned.
     * Those text nodes need to be wrapped in a span (toggle functionality).
     * All consecutive elements are joined in one 'read more/read less'.
     *
     * @private
     * @param {jQuery} $element
     */
    _insertReadMoreLess($element) {
        const groups = [];
        let readMoreNodes;

        // nodeType 1: element_node
        // nodeType 3: text_node
        const $children = $element.contents()
            .filter((index, content) =>
                content.nodeType === 1 || (content.nodeType === 3 && content.nodeValue.trim())
            );

        for (const child of $children) {
            let $child = $(child);

            // Hide Text nodes if "stopSpelling"
            if (
                child.nodeType === 3 &&
                $child.prevAll('[id*="stopSpelling"]').length > 0
            ) {
                // Convert Text nodes to Element nodes
                $child = $('<span>', {
                    text: child.textContent,
                    'data-o-mail-quote': '1',
                });
                child.parentNode.replaceChild($child[0], child);
            }

            // Create array for each 'read more' with nodes to toggle
            if (
                $child.attr('data-o-mail-quote') ||
                (
                    $child.get(0).nodeName === 'BR' &&
                    $child.prev('[data-o-mail-quote="1"]').length > 0
                )
            ) {
                if (!readMoreNodes) {
                    readMoreNodes = [];
                    groups.push(readMoreNodes);
                }
                $child.hide();
                readMoreNodes.push($child);
            } else {
                readMoreNodes = undefined;
                this._insertReadMoreLess($child);
            }
        }

        for (const group of groups) {
            // Insert link just before the first node
            const $readMoreLess = $('<a>', {
                class: 'o_Message_readMore',
                href: '#',
                text: READ_MORE,
            }).insertBefore(group[0]);

            // Toggle All next nodes
            let isReadMore = true;
            $readMoreLess.click(e => {
                e.preventDefault();
                isReadMore = !isReadMore;
                for (const $child of group) {
                    $child.hide();
                    $child.toggle(!isReadMore);
                }
                $readMoreLess.text(isReadMore ? READ_MORE : READ_LESS);
            });
        }
    }

    /**
     * @private
     * @param {Object} param0
     * @param {integer} param0.id
     * @param {string} param0.model
     */
    _redirect({ id, model }) {
        this.storeDispatch('redirect', { id, model });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        if (ev.target.closest('.o_mention')) {
            this._redirect({
                id: Number(ev.target.dataset.oeId),
                model: ev.target.dataset.oeModel,
            });
            ev.preventDefault();
            return;
        }
        if (ev.target.closest('.o_mail_redirect')) {
            this._redirect({
                id: Number(ev.target.dataset.oeId),
                model: ev.target.dataset.oeModel,
            });
            ev.preventDefault();
            return;
        }
        ev.stopPropagation();
        this.state.isClicked = !this.state.isClicked;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickAuthor(ev) {
        if (!this.hasAuthorRedirect) {
            return;
        }
        if (!this.storeProps.author) {
            return;
        }
        this._redirect({
            id: this.storeProps.author.id,
            model: this.storeProps.author._model,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickModerationAccept(ev) {
        ev.preventDefault();
        this.storeDispatch('moderateMessages', [this.message.localId], 'accept');
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickModerationAllow(ev) {
        ev.preventDefault();
        this.storeDispatch('moderateMessages', [this.message.localId], 'allow');
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickModerationBan(ev) {
        ev.preventDefault();
        this.state.hasModerationBanDialog = true;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickModerationDiscard(ev) {
        ev.preventDefault();
        this.state.hasModerationDiscardDialog = true;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickModerationReject(ev) {
        ev.preventDefault();
        this.state.hasModerationRejectDialog = true;
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickOriginThread(ev) {
        ev.preventDefault();
        this._redirect({
            id: this.storeProps.originThread.id,
            model: this.storeProps.originThread._model,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickStar(ev) {
        ev.stopPropagation();
        return this.storeDispatch('toggleStarMessage', this.message.localId);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickMarkAsRead(ev) {
        ev.stopPropagation();
        return this.storeDispatch('markMessagesAsRead', [this.message.localId]);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickReply(ev) {
        ev.stopPropagation();
        this.trigger('o-reply-message', {
            messageLocalId: this.message.localId,
        });
    }

    /**
     * @private
     */
    _onDialogClosedModerationBan() {
        this.state.hasModerationBanDialog = false;
    }

    /**
     * @private
     */
    _onDialogClosedModerationDiscard() {
        this.state.hasModerationDiscardDialog = false;
    }

    /**
     * @private
     */
    _onDialogClosedModerationReject() {
        this.state.hasModerationRejectDialog = false;
    }

    /**
     * @private
     */
    _onChangeCheckbox() {
        this.env.store.dispatch('setMessagesCheck',
            [this.message.localId],
            this.storeProps.thread.localId,
            this.props.threadStringifiedDomain,
            {
                checkValue: this._checkboxRef.el.checked,
            },
        );
    }

}

Object.assign(Message, {
    components,
    defaultProps: {
        hasAuthorRedirect: false,
        hasCheckbox: false,
        hasMarkAsReadIcon: false,
        hasReplyIcon: false,
        isSelected: false,
        isSquashed: false,
        threadStringifiedDomain: '[]',
    },
    props: {
        attachmentsDetailsMode: {
            type: String, //['auto', 'card', 'hover', 'none']
            optional: true
        },
        hasAuthorRedirect: Boolean,
        hasCheckbox: Boolean,
        hasMarkAsReadIcon: Boolean,
        hasReplyIcon: Boolean,
        isSelected: Boolean,
        isSquashed: Boolean,
        messageLocalId: String,
        threadLocalId: {
            type: String,
            optional: true,
        },
        threadStringifiedDomain: String,
    },
    template: 'mail.messaging.component.Message',
});

return Message;

});
