odoo.define('im_livechat.component.NotificationList', function (require) {
'use strict';

const NotificationList = require('mail.component.NotificationList');

const { patch } = require('web.utils');

NotificationList._allowedFilters.push('livechat');

patch(NotificationList, 'im_livechat_notification_list', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * Override to include livechat channels.
     *
     * @override
     */
    _useStoreThreads(state, props) {
        if (props.filter === 'livechat') {
            return this.storeGetters.livechatList();
        }
        return this._super(...arguments);
    },

});

});
