/** @odoo-module **/

import * as mailUtils from '@mail/js/utils';

import { useModels } from '@mail/component_hooks/use_models/use_models';
import { useShouldUpdateBasedOnProps } from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import { MessageAuthorPrefix } from '@mail/components/message_author_prefix/message_author_prefix';
import { PartnerImStatusIcon } from '@mail/components/partner_im_status_icon/partner_im_status_icon';

const { Component } = owl;
const { useRef } = owl.hooks;

const components = { MessageAuthorPrefix, PartnerImStatusIcon };

export class ThreadPreview extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useModels();
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
        if (this.thread.correspondent) {
            return this.thread.correspondent.avatarUrl;
        }
        return `/web/image/mail.channel/${this.thread.id}/avatar_128?unique=${this.thread.avatarUnique}`;
    }

    /**
     * Get inline content of the last message of this conversation.
     *
     * @returns {string}
     */
    get inlineLastMessageBody() {
        if (!this.thread.lastMessage) {
            return '';
        }
        return mailUtils.htmlToTextContentInline(this.thread.lastMessage.prettyBody);
    }

    /**
     * @returns {mail.thread}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
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
        this.thread.open();
        if (!this.env.messaging.device.isMobile) {
            this.env.messaging.messagingMenu.close();
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickMarkAsRead(ev) {
        if (this.thread.lastNonTransientMessage) {
            this.thread.markAsSeen(this.thread.lastNonTransientMessage);
        }
    }

}

Object.assign(ThreadPreview, {
    components,
    props: {
        threadLocalId: String,
    },
    template: 'mail.ThreadPreview',
});
