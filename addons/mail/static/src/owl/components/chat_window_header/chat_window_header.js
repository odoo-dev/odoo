odoo.define('mail.component.ChatWindowHeader', function (require) {
'use strict';

const Icon = require('mail.component.ThreadIcon');
const useStore = require('mail.hooks.useStore');

const { Component } = owl;
const { useDispatch, useGetters } = owl.hooks;

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
            const headerBackgroundColor = state.chatWindowManager.header_background_color;
            const titleColor = state.chatWindowManager.title_color;
            const thread = state.threads[props.chatWindowLocalId];
            const threadName = thread
                ? this.storeGetters.threadName(thread.localId)
                : undefined;
            return {
                headerBackgroundColor,
                isMobile: state.isMobile,
                thread,
                threadName,
                titleColor,
            };
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {string}
     */
    getStyle() {
        const styles = {};
        if (this.storeProps.headerBackgroundColor) {
            styles['background-color'] = this.storeProps.headerBackgroundColor;
        }
        if (this.storeProps.titleColor) {
            styles['color'] = this.storeProps.titleColor;
        }
        return this.env.getStyleString(styles);
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
