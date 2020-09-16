/** @odoo-module alias=im_livechat.components.DiscussSidebarItem **/

import DiscussSidebarItem from 'mail.components.DiscussSidebarItem';

import { patch } from 'web.utils';

patch(
    DiscussSidebarItem.prototype,
    'im_livechat.components.DiscussSidebarItem',
    {
        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * @override
         */
        hasUnpin(...args) {
            const res = this._super(...args);
            return res || this.thread.channelType(this) === 'livechat';
        },
    },
);
