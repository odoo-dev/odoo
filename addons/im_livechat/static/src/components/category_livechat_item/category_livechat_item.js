odoo.define('im_livechat/static/src/components/category_livechat_item/category_livechat_item.js', function (require) {
'use strict'

const components = {
    CategoryItem: require('mail/static/src/components/category_item/category_item.js'),
    ThreadIcon: require('mail/static/src/components/thread_icon/thread_icon.js'),
};

const useStore = require('mail/static/src/component_hooks/use_store/use_store.js');

const { Component } = owl;

class CategoryLivechatItem extends Component {

    /**
     * @override
     */
    constructor(...args) {
        super(...args);
        useStore(props => {
            const thread = this.env.models['mail.thread'].get(props.threadLocalId);
            return {
                thread: thread ? thread.__state : undefined,
            }
        });
    }

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------
    
    /**
     * @returns {mail.thread}
     */
    get thread() {
        return this.env.models['mail.thread'].get(this.props.threadLocalId);
    }

    //--------------------------------------------------------------------------
    // Handler
    //--------------------------------------------------------------------------
    
    /**
     * 
     * @param {MouseEvent} ev 
     */
    _onClickUnpin(ev) {
        ev.stopPropagation();
        this.thread.unsubscribe();
    }
    
}

Object.assign(CategoryLivechatItem, {
    components,
    props: {
        threadLocalId: String,
    },
    template: 'im_livechat.CategoryLivechatItem',
});

return CategoryLivechatItem;

});