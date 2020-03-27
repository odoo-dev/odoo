odoo.define('im_livechat.messaging.component.DiscussSidebar', function (require) {
'use strict';

const components = {
    DiscussSidebar: require('mail.messaging.component.DiscussSidebar'),
};

const { patch } = require('web.utils');

patch(components.DiscussSidebar, 'im_livechat.messaging.component.DiscussSidebar', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Return the list of livechats that match the quick search value input.
     *
     * @returns {mail.store.model.Thread[]}
     */
    quickSearchOrderedAndPinnedLivechatList() {
        if (!this.state.sidebarQuickSearchValue) {
            return this.storeProps.allOrderedAndPinnedLivechats;
        }
        const qsVal = this.state.sidebarQuickSearchValue.toLowerCase();
        return this.storeProps.allOrderedAndPinnedLivechats.filter(livechat => {
            const nameVal = this.storeGetters.threadName(livechat.localId).toLowerCase();
            return nameVal.includes(qsVal);
        });
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _useStoreCompareDepth(state, props) {
        return Object.assign(this._super(...arguments), {
            allOrderedAndPinnedLivechats: 1,
        });
    },
    /**
     * Override to include livechat channels on the sidebar.
     *
     * @override
     */
    _useStoreSelector(state, props) {
        return Object.assign(this._super(...arguments), {
            allOrderedAndPinnedLivechats: this.storeGetters.allOrderedAndPinnedLivechats(),
        });
    },

});

});
