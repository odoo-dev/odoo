odoo.define('mail.component.ChatWindowHeader', function (require) {
'use strict';

const Icon = require('mail.component.ThreadIcon');

const { Component } = owl;
const { useDispatch, useGetters, useStore } = owl.hooks;

class ChatWindowHeader extends Component {

    /**
     * @override
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.storeDispatch = useDispatch();
        this.storeGetters = useGetters();
        this.storeProps = useStore((state, props) => {
            const res = {
                isMobile: state.misc.isMobile,
            };
            if (props.chatWindowLocalId !== 'new_message') {
                res.thread = this.storeGetters.getStoreObject({
                    storeKey: 'threads',
                    localId: props.chatWindowLocalId,
                    keys: ['id', 'localId', '_model', 'message_unread_counter'],
                    computes: [
                        { name: 'directPartner', keys: ['name'] },
                        { name: 'name' },
                    ],
                });
            }
            return res;
        });
    }

    //--------------------------------------------------------------------------
    // Getter / Setter
    //--------------------------------------------------------------------------

    /**
     * TODO SEB this should be in the view
     * @return {string}
     */
    get name() {
        if (this.storeProps.thread) {
            return this.storeProps.thread.name;
        }
        return this.env._t("New message");
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
        this.storeDispatch('closeChatWindow', this.props.chatWindowLocalId);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickExpand(ev) {
        if (!this.storeProps.thread) {
            return;
        }
        if (['mail.channel', 'mail.box'].includes(this.storeProps.thread._model)) {
            this.env.do_action('mail.action_owl_discuss', {
                clear_breadcrumbs: false,
                active_id: this.storeProps.thread.localId,
                on_reverse_breadcrumb: () =>
                    // ideally discuss should do it itself...
                    this.storeDispatch('closeDiscuss'),
            });
        } else {
            this.storeDispatch('openDocument', {
                id: this.storeProps.thread.id,
                model: this.storeProps.thread._model,
            });
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftLeft(ev) {
        this.storeDispatch('shiftLeftChatWindow', this.props.chatWindowLocalId);
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftRight(ev) {
        this.storeDispatch('shiftRightChatWindow', this.props.chatWindowLocalId);
    }
}

ChatWindowHeader.components = {
    Icon,
};

ChatWindowHeader.defaultProps = {
    hasCloseAsBackButton: false,
    hasShiftLeft: false,
    hasShiftRight: false,
    isExpandable: false,
};

ChatWindowHeader.props = {
    chatWindowLocalId: String,
    hasCloseAsBackButton: {
        type: Boolean,
    },
    hasShiftLeft: {
        type: Boolean,
    },
    hasShiftRight: {
        type: Boolean,
    },
    isExpandable: {
        type: Boolean,
    },
};

ChatWindowHeader.template = 'mail.component.ChatWindowHeader';

return ChatWindowHeader;

});
