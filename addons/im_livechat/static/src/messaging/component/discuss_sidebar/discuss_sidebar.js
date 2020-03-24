odoo.define('im_livechat.component.DiscussSidebar', function (require) {
'use strict';

const DiscussSidebar = require('mail.component.DiscussSidebar');

const { patch } = require('web.utils');

patch(DiscussSidebar, 'im_livechat_discuss_sidebar', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Return the list of chats that match the quick search value input.
     *
     * @return {mail.store.model.Thread[]}
     */
    quickSearchLivechatList() {
        if (!this.state.quickSearchValue) {
            return this.storeProps.pinnedLivechatList;
        }
        const qsVal = this.state.quickSearchValue.toLowerCase();
        return this.storeProps.pinnedLivechatList.filter(livechat => {
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
    _compareDepth(state, props) {
        const res = this._super(...arguments);
        res.pinnedLivechatList = 1;
        return res;
    },
    /**
     * Override to include livechat channels on the sidebar.
     *
     * @override
     */
    _useStore(state, props) {
        const res = this._super(...arguments);
        res.pinnedLivechatList = this.storeGetters.pinnedLivechatList();
        return res;
    },

});

});
