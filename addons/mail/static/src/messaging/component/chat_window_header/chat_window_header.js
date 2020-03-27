odoo.define('mail.messaging.component.ChatWindowHeader', function (require) {
'use strict';

const components = {
    ThreadIcon: require('mail.messaging.component.ThreadIcon'),
};
const useStore = require('mail.messaging.component_hook.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

class ChatWindowHeader extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const thread = state.threads[props.chatWindowLocalId];
            const threadName = thread
                ? this.storeGetters.threadName(thread.localId)
                : undefined;
            return {
                isMobile: state.isMobile,
                thread,
                threadName,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

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
        this.trigger('o-clicked', {
            chatWindowLocalId: this.props.chatWindowLocalId,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickClose(ev) {
        ev.stopPropagation();
        this.storeDispatch('closeChatWindow', this.props.chatWindowLocalId);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickExpand(ev) {
        ev.stopPropagation();
        if (!this.thread) {
            return;
        }
        if (['mail.channel', 'mail.box'].includes(this.thread._model)) {
            this.env.do_action('mail.action_new_discuss', {
                clear_breadcrumbs: false,
                active_id: this.thread.localId,
                on_reverse_breadcrumb: () =>
                    // ideally discuss should do it itself...
                    this.storeDispatch('closeDiscuss'),
            });
        } else {
            this.storeDispatch('openDocument', {
                id: this.thread.id,
                model: this.thread._model,
            });
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftLeft(ev) {
        ev.stopPropagation();
        this.storeDispatch('shiftLeftChatWindow', this.props.chatWindowLocalId);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftRight(ev) {
        ev.stopPropagation();
        this.storeDispatch('shiftRightChatWindow', this.props.chatWindowLocalId);
    }

}

Object.assign(ChatWindowHeader, {
    components,
    defaultProps: {
        hasCloseAsBackButton: false,
        hasShiftLeft: false,
        hasShiftRight: false,
        isExpandable: false,
    },
    props: {
        chatWindowLocalId: String,
        hasCloseAsBackButton: Boolean,
        hasShiftLeft: Boolean,
        hasShiftRight: Boolean,
        isExpandable: Boolean,
    },
    template: 'mail.messaging.component.ChatWindowHeader',
});

return ChatWindowHeader;

});
