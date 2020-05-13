odoo.define('mail.model.Livechat', function (require) {
"use strict";

var TwoUserChannel = require('mail.model.TwoUserChannel');

/**
 * backend-side of the livechat.
 *
 * Any piece of code in JS that make use of Livechats must ideally interact with
 * such objects, instead of direct data from the server.
 */
var Livechat = TwoUserChannel.extend({
    _WEBSITE_USER_ID: '_websiteUser',
    _WEBSITE_USER_NAME: 'Website user',

    /**
     * @override
     * @param {Object} params
     * @param {Object} params.data
     */
    init: function (params) {
        this._super.apply(this, arguments);
        this._name = params.data.correspondent.name;
        this._WEBSITE_USER_NAME = this._name;
    },
});

return Livechat;

});
