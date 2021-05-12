/** @odoo-module **/

import DiscussSidebar from '@mail/components/discuss_sidebar/discuss_sidebar';

import { patch } from 'web.utils';

const components = { DiscussSidebar };

patch(components.DiscussSidebar.prototype, 'im_livechat/static/src/components/discuss_sidebar/discuss_sidebar.js', {

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Override to include livechat channels on the sidebar.
     *
     * @override
     */
    _useStoreSelector(props) {
        const categoryLivechat = this.env.messaging.discuss.categoryLivechat;
        return Object.assign(this._super(...arguments), {
            categoryLivechat: categoryLivechat,
            categroyLiveChatSelectedChannelsAmount: categoryLivechat && categoryLivechat.selectedChannels.length,
        });
    },

});
