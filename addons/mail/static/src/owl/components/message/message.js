odoo.define('mail.component.Message', function (require) {
'use strict';

const mailUtils = require('mail.utils');
const AttachmentList = require('mail.component.AttachmentList');
const PartnerImStatusIcon = require('mail.component.PartnerImStatusIcon');

const core = require('web.core');
const time = require('web.time');

const { Component, useState } = owl;
const { useDispatch, useGetters, useRef, useStore } = owl.hooks;

const _lt = core._lt;
const READ_MORE = _lt("read more");
const READ_LESS = _lt("read less");

class Message extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.state = useState({
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
            const odoobot = state.partners['res.partner_odoobot'];
            const originThread = state.threads[message.originThreadLocalId];
            const thread = state.threads[props.threadLocalId];
            return {
                attachmentLocalIds,
                author,
                isMobile: state.isMobile,
                message,
                odoobot,
                originThread,
                thread,
            };
        });
        /**
         * Reference to the content of the message.
         */
        this._contentRef = useRef('content');
        /**
         * Id of setInterval used to auto-update time elapsed of message at
         * regular time.
         */
        this._intervalId = undefined;
    }

    mounted() {
        this.state.timeElapsed = mailUtils.timeFromNow(this.storeProps.message.date);
        this._insertReadMoreLess($(this._contentRef.el));
    }

    willUnmount() {
        clearInterval(this._intervalId);
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @return {string}
     */
    get avatar() {
        if (
            this.storeProps.author &&
            this.storeProps.author === this.storeProps.odoobot
        ) {
            return '/mail/static/src/img/odoobot.png';
        } else if (this.storeProps.author) {
            return `/web/image/res.partner/${this.storeProps.author.id}/image_128`;
        } else if (this.storeProps.message.message_type === 'email') {
            return '/mail/static/src/img/email_icon.png';
        }
        return '/mail/static/src/img/smiley/avatar.jpg';
    }

    /**
     * Get the date time of the message at current user locale time.
     *
     * @return {string}
     */
    get datetime() {
        return this.storeProps.message.date.format(time.getLangDatetimeFormat());
    }

    /**
     * Get the displayed author name of this message.
     *
     * @return {string}
     */
    get displayedAuthorName() {
        if (this.storeProps.author) {
            return this.storeGetters.partnerName(this.storeProps.author.localId);
        }
        return this.storeProps.message.email_from || this.env._t("Anonymous");
    }

    /**
     * Determine whether author redirect feature is enabled on message.
     * Click on message author should redirect to author.
     *
     * @return {boolean}
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
     * @return {boolean}
     */
    get hasDifferentOriginThread() {
        return (
            this.storeProps.originThread &&
            this.storeProps.originThread !== this.storeProps.thread
        );
    }

    /**
     * @return {string[]}
     */
    get imageAttachmentLocalIds() {
        if (!this.storeProps.message.attachmentLocalIds) {
            return [];
        }
        return this.storeProps.message.attachmentLocalIds.filter(attachmentLocalId =>
            this.storeGetters.attachmentFileType(attachmentLocalId) === 'image'
        );
    }

    /**
     * Determine whether the message is starred.
     *
     * @return {boolean}
     */
    get isStarred() {
        return this.storeProps.message.threadLocalIds.includes('mail.box_starred');
    }

    /**
     * @return {string[]}
     */
    get nonImageAttachmentLocalIds() {
        if (!this.storeProps.message.attachmentLocalIds) {
            return [];
        }
        return this.storeProps.message.attachmentLocalIds.filter(attachmentLocalId =>
            this.storeGetters.attachmentFileType(attachmentLocalId) !== 'image'
        );
    }

    /**
     * Get the shorttime format of the message date.
     *
     * @return {string}
     */
    get shortTime() {
        return this.storeProps.message.date.format('hh:mm');
    }

    /**
     * @return {string}
     */
    get timeElapsed() {
        clearInterval(this._intervalId);
        this._intervalId = setInterval(() => {
            this.state.timeElapsed = mailUtils.timeFromNow(this.storeProps.message.date);
        }, 60 * 1000);
        return this.state.timeElapsed;
    }

    /**
     * @return {Object}
     */
    get trackingValues() {
        if (!this.props.tracking_value_ids) {
            // might happen in tests
            return [];
        }
        return this.storeProps.message.tracking_value_ids.map(trackingValue => {
            let value = {
                changed_field: trackingValue.changed_field,
                old_value: trackingValue.old_value,
                new_value: trackingValue.new_value,
                field_type: trackingValue.field_type,
            };
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

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Tell whether the bottom of this message is visible or not.
     *
     * @param {Object} param0
     * @param {integer} [offset=0]
     * @return {boolean}
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
     * @return {boolean}
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
     * @return {Promise}
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
        this.trigger('o-redirect', { id, model });
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
            this.trigger('o-redirect', {
                id: Number(ev.target.dataset.oeId),
                model: ev.target.dataset.oeModel,
            });
            ev.preventDefault();
            return;
        }
        if (ev.target.closest('.o_mail_redirect')) {
            this.trigger('o-redirect', {
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
    _onClickOriginThread(ev) {
        ev.preventDefault();
        this.trigger('o-redirect', {
            id: this.storeProps.originThread.id,
            model: this.storeProps.originThread._model,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickStar(ev) {
        return this.storeDispatch('toggleStarMessage', this.props.messageLocalId);
    }

    /**
     * @private
     */
    _onClickMarkAsRead() {
        return this.storeDispatch('markMessagesAsRead', [this.props.messageLocalId]);
    }

    /**
     * @private
     */
    _onClickReply() {
        this.trigger('o-reply-message', {
            messageLocalId: this.props.messageLocalId,
        });
    }
}

Message.components = { AttachmentList, PartnerImStatusIcon };

Message.defaultProps = {
    hasAuthorRedirect: false,
    hasMarkAsReadIcon: false,
    hasReplyIcon: false,
    isSelected: false,
    isSquashed: false,
};

Message.props = {
    attachmentsDetailsMode: {
        type: String, //['auto', 'card', 'hover', 'none']
        optional: true
    },
    hasAuthorRedirect: {
        type: Boolean,
    },
    hasMarkAsReadIcon: {
        type: Boolean,
    },
    hasReplyIcon: {
        type: Boolean,
    },
    isSelected: {
        type: Boolean,
    },
    isSquashed: {
        type: Boolean,
    },
    messageLocalId: String,
    threadLocalId: {
        type: String,
        optional: true,
    },
};

Message.template = 'mail.component.Message';

return Message;

});
