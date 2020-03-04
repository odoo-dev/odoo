odoo.define('im_livechat.component.Discuss', function (require) {
'use strict';

const Discuss = require('mail.component.Discuss');

const { patch } = require('web.utils');

patch(Discuss, 'im_livechat_discuss', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    getMobileMessagingNavbarTabs(...args) {
        const res = this._super(...args);
        res.push({
            icon: 'fa fa-comments',
            id: 'livechat',
            label: this.env._t("Livechat"),
        });
        return res;
    }

});

});
