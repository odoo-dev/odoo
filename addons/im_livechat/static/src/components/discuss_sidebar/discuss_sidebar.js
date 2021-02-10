odoo.define('im_livechat/static/src/components/discuss_sidebar/discuss_sidebar.js', function (require) {
'use strict';

const components = {
    DiscussSidebar: require('mail/static/src/components/discuss_sidebar/discuss_sidebar.js'),
    CategoryLivechatItem: require('im_livechat/static/src/components/category_livechat_item/category_livechat_item.js'),
    CategoryTitle: require('mail/static/src/components/category_title/category_title.js'),
};

const { patch } = require('web.utils');

patch(components.DiscussSidebar.prototype, 'im_livechat/static/src/components/discuss_sidebar/discuss_sidebar.js', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Return the list of livechats that match the quick search value input.
     *
     * @returns {mail.thread[]}
     */
    quickSearchPinnedAndSortedLivechatTypeThreads() {
        return this.discuss.quickSearchPinnedAndSortedLivechatTypeThreads;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _useStoreCompareDepth() {
        return Object.assign(this._super(...arguments), {
            quickSearchPinnedAndSortedLivechatTypeThreads: 1,
        });
    },
    /**
     * Override to include livechat channels on the sidebar.
     *
     * @override
     */
    _useStoreSelector(props) {
        return Object.assign(this._super(...arguments), {
            quickSearchPinnedAndSortedLivechatTypeThreads: this.discuss && this.discuss.quickSearchPinnedAndSortedLivechatTypeThreads,
        });
    },

});

Object.assign(components.DiscussSidebar.components, {
    CategoryLivechatItem: components.CategoryLivechatItem,
    CategoryTitle: components.CategoryTitle,
});

});
