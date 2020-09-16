/** @odoo-module alias=mail.components.ThreadPreview **/

import usingModels from 'mail.componentMixins.usingModels';
import htmlToTextContentInline from 'mail.utils.htmlToTextContentInline';

const { Component, QWeb } = owl;
const { useRef } = owl.hooks;

class ThreadPreview extends usingModels(Component) {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        /**
         * Reference of the "mark as read" button. Useful to disable the
         * top-level click handler when clicking on this specific button.
         */
        this._markAsReadRef = useRef('markAsRead');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Get the image route of the thread.
     *
     * @returns {string}
     */
    image() {
        if (this.thread.$$$correspondent(this)) {
            return this.thread.$$$correspondent(this).$$$avatarUrl(this);
        }
        return `/web/image/mail.channel/${this.thread.$$$id(this)}/image_128`;
    }

    /**
     * Get inline content of the last message of this conversation.
     *
     * @returns {string}
     */
    get inlineLastMessageBody() {
        if (!this.thread.$$$lastMessage(this)) {
            return '';
        }
        return htmlToTextContentInline(
            this.thread.$$$lastMessage(this).$$$prettyBody(this)
        );
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        const markAsRead = this._markAsReadRef.el;
        if (markAsRead && markAsRead.contains(ev.target)) {
            // handled in `_onClickMarkAsRead`
            return;
        }
        this.env.services.action.dispatch(
            'Thread/open',
            this.thread,
        );
        if (!this.env.services.model.messaging.$$$device(this).$$$isMobile(this)) {
            this.env.services.action.dispatch(
                'MessagingMenu/close',
                this.env.services.model.messaging.$$$messagingMenu(this),
            );
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickMarkAsRead(ev) {
        if (this.thread.$$$lastMessage(this)) {
            this.env.services.action.dispatch(
                'Thread/markAsSeen',
                this.thread,
                this.thread.$$$lastNonTransientMessage(this),
            );
        }
    }

}

Object.assign(ThreadPreview, {
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
    template: 'mail.ThreadPreview',
});

QWeb.registerComponent('ThreadPreview', ThreadPreview);

export default ThreadPreview;
