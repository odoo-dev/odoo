odoo.define('mail.messaging.component.ThreadPreview', function (require) {
'use strict';

const components = {
    MessageAuthorPrefix: require('mail.messaging.component.MessageAuthorPrefix'),
    PartnerImStatusIcon: require('mail.messaging.component.PartnerImStatusIcon'),
};
const useStore = require('mail.messaging.component_hook.useStore');
const mailUtils = require('mail.utils');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class ThreadPreview extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const threadLocalId = props.threadLocalId;
            const thread = state.threads[threadLocalId];
            let lastMessage;
            let lastMessageAuthor;
            const { length: l, [l - 1]: lastMessageLocalId } = thread.messageLocalIds;
            lastMessage = state.messages[lastMessageLocalId];
            if (lastMessage) {
                lastMessageAuthor = state.partners[lastMessage.authorLocalId];
            }
            return {
                isMobile: state.isMobile,
                lastMessage,
                lastMessageAuthor,
                thread,
                threadDirectPartner: thread.directPartnerLocalId
                    ? state.partners[thread.directPartnerLocalId]
                    : undefined,
                threadName: this.storeGetters.threadName(threadLocalId),
            };
        });
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
        const directPartnerLocalId = this.thread.directPartnerLocalId;
        if (directPartnerLocalId) {
            const directPartner = this.env.store.state.partners[directPartnerLocalId];
            return `/web/image/res.partner/${directPartner.id}/image_128`;
        }
        return `/web/image/mail.channel/${this.thread.id}/image_128`;
    }

    /**
     * Get inline content of the last message of this conversation.
     *
     * @returns {string}
     */
    get inlineLastMessageBody() {
        if (!this.storeProps.lastMessage) {
            return '';
        }
        return mailUtils.parseAndTransform(
            this.storeGetters.messagePrettyBody(this.storeProps.lastMessage.localId),
            mailUtils.inline);
    }

    /**
     * Determine whether the last message of this conversation comes from
     * current user or not.
     *
     * @returns {boolean}
     */
    get isMyselfLastMessageAuthor() {
        return (
            this.storeProps.lastMessageAuthor &&
            this.storeProps.lastMessageAuthor.id === this.env.session.partner_id
        ) || false;
    }

    /**
     * @returns {mail.messaging.entity.Thread}
     */
    get thread() {
        return this.storeProps.thread;
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClick(ev) {
        this.trigger('o-select-thread', {
            threadLocalId: this.thread.localId,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickMarkAsRead(ev) {
        ev.stopPropagation();
        this.storeDispatch('markThreadAsSeen', this.props.threadLocalId);
    }

}

Object.assign(ThreadPreview, {
    components,
    props: {
        threadLocalId: String,
    },
    template: 'mail.messaging.component.ThreadPreview',
});

return ThreadPreview;

});
