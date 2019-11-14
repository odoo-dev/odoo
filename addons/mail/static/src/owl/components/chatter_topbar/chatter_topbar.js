odoo.define('mail.component.ChatterTopbar', function (require) {
'use strict';

const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch } = owl.hooks;

class ChatterTopbar extends Component {
    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeProps = useStore((state, props) => {
            const chatter = state.chatters[props.chatterLocalId];
            const thread = chatter.threadLocalId
                ? state.threads[chatter.threadLocalId]
                : undefined;
            return {
                areAttachmentsLoaded: thread && thread.areAttachmentsLoaded,
                attachmentsAmount: thread && thread.attachmentLocalIds
                    ? thread.attachmentLocalIds.length
                    : 0,
                chatter,
                // TODO SEB this is currently always 0 (yes I know - XDU)
                followersAmount: 0,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickAttachments(ev) {
        if (this.storeProps.chatter.isAttachmentBoxVisible) {
            this.storeDispatch('hideChatterAttachmentBox', this.props.chatterLocalId);
        } else {
            this.storeDispatch('showChatterAttachmentBox', this.props.chatterLocalId);
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickFollow(ev) {
        // TODO
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickFollowers(ev) {
        // TODO
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickLogNote(ev) {
        if (this.storeProps.chatter.isComposerVisible && this.storeProps.chatter.isComposerLog) {
            this.storeDispatch('hideChatterComposer', this.props.chatterLocalId);
        } else {
            this.storeDispatch('showChatterLogNote', this.props.chatterLocalId);
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickScheduleActivity(ev) {
        // TODO
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickSendMessage(ev) {
        if (this.storeProps.chatter.isComposerVisible && !this.storeProps.chatter.isComposerLog) {
            this.storeDispatch('hideChatterComposer', this.props.chatterLocalId);
        } else {
            this.storeDispatch('showChatterSendMessage', this.props.chatterLocalId);
        }
    }
}

ChatterTopbar.props = {
    chatterLocalId: String,
};

ChatterTopbar.template = 'mail.component.ChatterTopbar';

return ChatterTopbar;

});
