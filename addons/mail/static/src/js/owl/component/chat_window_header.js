odoo.define('mail.component.ChatWindowHeader', function (require) {
"use strict";

const Icon = require('mail.component.ThreadIcon');

class ChatWindowHeader extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.components = { Icon };
        this.template = 'mail.component.ChatWindowHeader';
    }

    //--------------------------------------------------------------------------
    // Getter / Setter
    //--------------------------------------------------------------------------

    get name() {
        if (this.props.thread) {
            return this.props.threadName;
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
        this.trigger('o-close', {
            chatWindowLocalId: this.props.chatWindowLocalId,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickExpand(ev) {
        if (!this.props.thread) {
            return;
        }
        if (['mail.channel', 'mail.box'].includes(this.props.thread._model)) {
            this.env.do_action('mail.action_owl_discuss', {
                clear_breadcrumbs: false,
                active_id: this.props.thread.localId,
                on_reverse_breadcrumb: () =>
                    // ideally discuss should do it itself...
                    this.env.store.commit('closeDiscuss'),
            });
        } else {
            this.env.do_action({
                type: 'ir.actions.act_window',
                res_model: this.props.thread._model,
                views: [[false, 'form']],
                res_id: this.props.thread.id,
            });
        }
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftLeft(ev) {
        this.trigger('o-shift-left', {
            chatWindowLocalId: this.props.chatWindowLocalId,
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickShiftRight(ev) {
        this.trigger('o-shift-right', {
            chatWindowLocalId: this.props.chatWindowLocalId,
        });
    }
}

ChatWindowHeader.defaultProps = {
    hasCloseAsBackButton: false,
    hasShiftLeft: false,
    hasShiftRight: false,
    isExpandable: false,
};

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {string} ownProps.chatWindowLocalId
 * @param {Object} state.getters
 * @return {Object}
 */
ChatWindowHeader.mapStoreToProps = function (state, ownProps, getters) {
    const chatWindowLocalId = ownProps.chatWindowLocalId;
    const thread = state.threads[chatWindowLocalId];
    const threadName = thread
        ? getters.threadName(chatWindowLocalId)
        : undefined;
    return {
        isMobile: state.isMobile,
        thread,
        threadName,
    };
};

ChatWindowHeader.props = {
    chatWindowLocalId: String,
    hasCloseAsBackButton: Boolean,
    hasShiftLeft: Boolean,
    hasShiftRight: Boolean,
    isExpandable: Boolean,
    isMobile: Boolean,
    thread: {
        type: Object, // {mail.store.model.Thread}
        optional: true,
    },
    threadName: {
        type: String,
        optional: true,
    },
};

return ChatWindowHeader;

});
