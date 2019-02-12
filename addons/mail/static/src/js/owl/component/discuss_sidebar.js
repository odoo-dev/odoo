odoo.define('mail.component.DiscussSidebar', function (require) {
'use strict';

const AutocompleteInput = require('mail.component.AutocompleteInput');
const SidebarItem = require('mail.component.DiscussSidebarItem');

class DiscussSidebar extends owl.store.ConnectedComponent {

    /**
     * @param {...any} args
     */
    constructor(...args) {
        super(...args);
        this.components = {
            AutocompleteInput,
            SidebarItem
        };
        this.state = {
            quickSearchValue: "",
        };
        this.template = 'mail.component.DiscussSidebar';
    }

    //--------------------------------------------------------------------------
    // Getters / Setters
    //--------------------------------------------------------------------------

    /**
     * @return {mail.store.model.Thread[]}
     */
    get quickSearchChannelList() {
        if (!this.state.quickSearchValue) {
            return this.props.pinnedChannelList;
        }
        const qsVal = this.state.quickSearchValue.toLowerCase();
        return this.props.pinnedChannelList.filter(channel => {
            const nameVal = this.env.store.getters.threadName(channel.localId).toLowerCase();
            return nameVal.indexOf(qsVal) !== -1;
        });
    }

    /**
     * @return {mail.store.model.Thread[]}
     */
    get quickSearchChatList() {
        if (!this.state.quickSearchValue) {
            return this.props.pinnedChatList;
        }
        const qsVal = this.state.quickSearchValue.toLowerCase();
        return this.props.pinnedChatList.filter(chat => {
            const nameVal = this.env.store.getters.threadName(chat.localId).toLowerCase();
            return nameVal.indexOf(qsVal) !== -1;
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @param {string} threadLocalId
     * @return {boolean}
     */
    isItemPartiallyVisible(threadLocalId) {
        return this.refs[threadLocalId].isPartiallyVisible({
            scrollable: this.el,
        });
    }

    /**
     * @param {string} threadLocalId
     */
    scrollToItem(threadLocalId) {
        this.refs[threadLocalId].scrollIntoview();
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickChannelAdd(ev) {
        this.trigger('o-discuss-adding-channel');
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickChannelTitle(ev) {
        return this.env.do_action({
            name: this.env._t("Public Channels"),
            type: 'ir.actions.act_window',
            res_model: 'mail.channel',
            views: [[false, 'kanban'], [false, 'form']],
            domain: [['public', '!=', 'private']]
        });
    }

    /**
     * @private
     * @param {MouseEvent} ev
     */
    _onClickChatAdd(ev) {
        this.trigger('o-discuss-adding-chat');
    }

    /**
     * @private
     * @param {CustomEvent} ev
     * @param {Object} ev.detail
     * @param {string} ev.detail.threadLocalId
     */
    _onClickedItem(ev) {
        return this.trigger('o-select-thread', {
            threadLocalId: ev.detail.threadLocalId,
        });
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onHideAddingItem(ev) {
        this.trigger('o-discuss-cancel-adding-item');
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onInputQuickSearch(ev) {
        this.state.quickSearchValue = this.refs.quickSearch.value;
    }
}

/**
 * @param {Object} state
 * @param {Object} ownProps
 * @param {Object} getters
 * @return {Object}
 */
DiscussSidebar.mapStoreToProps = function (state, ownProps, getters) {
    return {
        pinnedChannelList: getters.pinnedChannelList(),
        pinnedChatList: getters.pinnedChatList(),
        pinnedMailboxList: getters.pinnedMailboxList(),
        pinnedMailChannelAmount: getters.pinnedMailChannelAmount(),
    };
};

DiscussSidebar.props = {
    activeThreadLocalId: {
        type: String,
        optional: true,
    },
    addItemChannelInputPlaceholder: String,
    addItemChatInputPlaceholder: String,
    isAddingChannel: Boolean,
    isAddingChat: Boolean,
    onAddChannelAutocompleteSelect: Function,
    onAddChannelAutocompleteSource: Function,
    onAddChatAutocompleteSelect: Function,
    onAddChatAutocompleteSource: Function,
    pinnedChannelList: {
        type: Array,
        element: Object, // {mail.store.model.Thread}
    },
    pinnedChatList: {
        type: Array,
        element: Object, // {mail.store.model.Thread}
    },
    pinnedMailboxList: {
        type: Array,
        element: Object, // {mail.store.model.Thread}
    },
    pinnedMailChannelAmount: Number,
};

return DiscussSidebar;

});
