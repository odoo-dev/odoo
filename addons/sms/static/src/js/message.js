odoo.define('sms.model.Message', function (require) {
"use strict";

var core = require('web.core');
var _t = core._t;

var Message = require('mail.model.Message');

Message.include({
    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    getNotificationIcon: function () {
        if (this.getType() === 'sms') {
            return 'fa fa-mobile';
        }
        return this._super(...arguments);
    },
    /**
     * @override
     */
    getNotificationText: function () {
        if (this.getType() === 'sms') {
            return _t("SMS");
        }
        return this._super(...arguments);
    },
});
});
