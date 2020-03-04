odoo.define('im_livechat.component.DiscussSidebarItem', function (require) {
'use strict';

const DiscussSidebarItem = require('mail.component.DiscussSidebarItem');

const { patch } = require('web.utils');

patch(DiscussSidebarItem, 'im_livechat_discuss_sidebar_item', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    hasUnpin(...args) {
        const res = this._super(...args);
        return res || this.storeProps.thread.channel_type === 'livechat';
    }

});

});
