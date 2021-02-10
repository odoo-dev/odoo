odoo.define('im_livechat/static/src/components/category_livechat_title/category_livechat_title.js', function (require) {
'use strict'

const components = {
    CategoryTitle: require('mail/static/src/components/category_title/category_title.js'),
};

const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component } = owl;

class CategoryLivechatTitle extends Component {
    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            return {
                livechats: this.env.messaging && this.env.messaging.allOrderedAndPinnedLivechats,
            }
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    get unreadCounter() {
        return this.env.messaging.allOrderedAndPinnedLivechats
            .reduce((total, thread) => {
                const counter = thread.localMessageUnreadCounter ? thread.localMessageUnreadCounter : 0;
                return counter + total;
            }, 0);
    }
}

Object.assign(CategoryLivechatTitle, {
    components,
    props: {},
    template: 'im_livechat.CategoryLivechatTitle' ,
});

return CategoryLivechatTitle;
});