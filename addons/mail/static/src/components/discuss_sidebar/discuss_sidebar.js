/** @odoo-module **/

import useShouldUpdateBasedOnProps from '@mail/component_hooks/use_should_update_based_on_props/use_should_update_based_on_props';
import useStore from '@mail/component_hooks/use_store/use_store';
import useUpdate from '@mail/component_hooks/use_update/use_update';
import { DiscussSidebarCategory } from '@mail/components/discuss_sidebar_category/discuss_sidebar_category';
import { DiscussSidebarMailBox } from '@mail/components/discuss_sidebar_mailbox/discuss_sidebar_mailbox';

const { Component } = owl;
const { useRef } = owl.hooks;

const components = { DiscussSidebarCategory, DiscussSidebarMailBox };

class DiscussSidebar extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useShouldUpdateBasedOnProps();
        useStore((...args) => this._useStoreSelector(...args));
        useUpdate({ func: () => this._update() });
        /**
         * Reference of the quick search input. Useful to filter channels and
         * chats based on this input content.
         */
        this._quickSearchInputRef = useRef('quickSearchInput');
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {mail.discuss}
     */
    get discuss() {
        return this.env.messaging && this.env.messaging.discuss;
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
     * @param {Object} props
     * @returns {Object}
     */
    _useStoreSelector(props) {
        const messaging = this.env.messaging;
        const discuss = this.env.messaging.discuss;
        return {
            allPinnedChannelsAmount: messaging.allPinnedChannels.length,
            categoryChannel: discuss.categoryChannel,
            categoryChat: discuss.categoryChat,
            history: messaging.history,
            inbox: messaging.inbox,
            moderation: messaging.moderation,
            moderationIsPinned: messaging.moderation && messaging.moderation.isPinned,
            starred: messaging.starred,
        };
    }

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     * @param {KeyboardEvent} ev
     */
    _onInputQuickSearch(ev) {
        ev.stopPropagation();
        this.discuss.onInputQuickSearch(this._quickSearchInputRef.el.value);
    }

}

Object.assign(DiscussSidebar, {
    components,
    props: {},
    template: 'mail.DiscussSidebar',
});

export default DiscussSidebar;
