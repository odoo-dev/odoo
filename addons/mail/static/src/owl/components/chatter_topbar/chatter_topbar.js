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
        const action = {
            type: 'ir.actions.act_window',
            name: this.env._t("Schedule Activity"),
            res_model: 'mail.activity',
            view_mode: 'form',
            views: [[false, 'form']],
            target: 'new',
            context: {
                default_res_id: this.storeProps.chatter.threadId,
                default_res_model: this.storeProps.chatter.threadModel,
            },
            res_id: false,
        };
        return this.env.do_action(action, {
            on_close: () => {
                // A bit "extreme", could be improved : normally only an activity is created (no update nor delete)
                this.storeDispatch('refreshChatterActivities', this.props.chatterLocalId);
            }
        });
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
