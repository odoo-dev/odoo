odoo.define('mail/static/src/components/discuss_sidebar/discuss_sidebar.js', function (require) {
'use strict';

const components = {
    AutocompleteInput: require('mail/static/src/components/autocomplete_input/autocomplete_input.js'),
    Category: require('mail/static/src/components/category/category.js'),
    CategoryItem: require('mail/static/src/components/category_item/category_item.js'),
    CategoryChannelItem: require('mail/static/src/components/category_channel_item/category_channel_item.js'),
    CategoryChannelTitle: require('mail/static/src/components/category_channel_title/category_channel_title.js'),
    CategoryChatItem: require('mail/static/src/components/category_chat_item/category_chat_item.js'),
    CategoryChatTitle: require('mail/static/src/components/category_chat_title/category_chat_title.js'),
};
const useShouldUpdateBasedOnProps = require('mail/static/src/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props.js');
const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');
const useUpdate = require('mail/static/src/component_hooks/use_update/use_update.js');

const { Component } = owl;
const { useRef } = owl.hooks;

class DiscussSidebar extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useStore(
            (...args) => this._useStoreSelector(...args),
            { compareDepth: this._useStoreCompareDepth() }
        );
        useUpdate({ func: () => this._update() });
        /**
         * Reference of the quick search input. Useful to filter channels and
         * chats based on this input content.
         */
        this._quickSearchInputRef = useRef('quickSearchInput');

        // bind since passed as props
        this._onAddChannelAutocompleteSelect = this._onAddChannelAutocompleteSelect.bind(this);
        this._onAddChannelAutocompleteSource = this._onAddChannelAutocompleteSource.bind(this);
        this._onAddChatAutocompleteSelect = this._onAddChatAutocompleteSelect.bind(this);
        this._onAddChatAutocompleteSource = this._onAddChatAutocompleteSource.bind(this);
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.thread[]}
     */
    get allPinnedAndSortedMailBoxes() {
        return this.env.messaging.allPinnedAndSortedMailBoxes;
    }

    get currentThread() {
         return this.discuss && this.discuss.thread;
    }

    /**
     * @returns {mail.discuss}
     */
    get discuss() {
        return this.env.messaging && this.env.messaging.discuss;
    }

    /**
     * Return the list of chats that match the quick search value input.
     *
     * @returns {mail.thread[]}
     */
    get quickSearchPinnedAndSortedChatTypeThreads() {
        return this.discuss.quickSearchPinnedAndSortedChatTypeThreads;
    }

    /**
     * Return the list of channels that match the quick search value input.
     *
     * @returns {mail.thread[]}
     */
    get quickSearchPinnedAndSortedChannelTypeThreads() {
        return this.discuss.quickSearchPinnedAndSortedChannelTypeThreads;
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _update() {
        if (!this.discuss) {
            return;
        }
        if (this._quickSearchInputRef.el) {
            this._quickSearchInputRef.el.value = this.discuss.sidebarQuickSearchValue;
        }
    }

    /**
     * @private
     * @returns {Object}
     */
    _useStoreCompareDepth() {
        return {
            allPinnedAndSortedChatTypeThreads: 1,
            allPinnedAndSortedChannelTypeThreads: 1,
            allPinnedAndSortedMailBoxes: 1,
        };
    }

    /**
     * @private
     * @param {Object} props
     * @returns {Object}
     */
    _useStoreSelector(props) {
        const discuss = this.env.messaging.discuss;
        return {
            allPinnedAndSortedChatTypeThreads: discuss && discuss.quickSearchPinnedAndSortedChatTypeThreads,
            allPinnedAndSortedChannelTypeThreads: discuss && discuss.quickSearchPinnedAndSortedChatTypeThreads,
            allPinnedAndSortedMailBoxes: this.env.messaging.allPinnedAndSortedMailBoxes,
            allPinnedChannelAmount: this.env.messaging.allPinnedChannelModelThreads.length,
            currentThread: discuss && discuss.thread ? discuss.thread.__state : undefined,
            discussIsAddingChannel: discuss && discuss.isAddingChannel,
            discussIsAddingChat: discuss && discuss.isAddingChat,
            discussSidebarQuickSearchValue: discuss && discuss.sidebarQuickSearchValue,
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onAddChannelAutocompleteSelect(ev, ui) {
        this.discuss.handleAddChannelAutocompleteSelect(ev, ui);
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onAddChannelAutocompleteSource(req, res) {
        this.discuss.handleAddChannelAutocompleteSource(req, res);
    }

    /**
     * @private
     * @param {Event} ev
     * @param {Object} ui
     * @param {Object} ui.item
     * @param {integer} ui.item.id
     */
    _onAddChatAutocompleteSelect(ev, ui) {
        this.discuss.handleAddChatAutocompleteSelect(ev, ui);
    }

    /**
     * @private
     * @param {Object} req
     * @param {string} req.term
     * @param {function} res
     */
    _onAddChatAutocompleteSource(req, res) {
        this.discuss.handleAddChatAutocompleteSource(req, res);
    }

    /**
     * Called when clicking on add channel icon.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickChannelAdd(ev) {
        ev.stopPropagation();
        this.discuss.update({ isAddingChannel: true });
    }

    /**
     * Called when clicking on channel title.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickChannelTitle(ev) {
        ev.stopPropagation();
        return this.env.bus.trigger('do-action', {
            action: {
                name: this.env._t("Public Channels"),
                type: 'ir.actions.act_window',
                res_model: 'mail.channel',
                views: [[false, 'kanban'], [false, 'form']],
                domain: [['public', '!=', 'private']]
            },
        });
    }

    /**
     * Called when clicking on add chat icon.
     *
     * @private
     * @param {MouseEvent} ev
     */
    _onClickChatAdd(ev) {
        ev.stopPropagation();
        this.discuss.update({ isAddingChat: true });
    }

    /**
     * @private
     * @param {CustomEvent} ev
     */
    _onHideAddingItem(ev) {
        ev.stopPropagation();
        this.discuss.clearIsAddingItem();
    }

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onInputQuickSearch(ev) {
        ev.stopPropagation();
        this.discuss.updateSidebarQuickSearchValue(this._quickSearchInputRef.el.value);
    }

}

Object.assign(DiscussSidebar, {
    components,
    props: {},
    template: 'mail.DiscussSidebar',
});

return DiscussSidebar;

});
