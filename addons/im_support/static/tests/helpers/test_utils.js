odoo.define('im_support.test_utils', function (require) {
"use strict";

var mailTestUtils = require('mail.testUtils');
var supportSession = require('im_support.SupportSession');

var testUtils = require('web.test_utils');


mailTestUtils.MockMailService.include({
    getServices: function () {
        return _.extend(this._super(), {
            support_bus_service: this.bus_service(),
        });
    },
});

/**
 * Extended version of addMockEnvironment that mocks RPCs done to the Support
 * server (CORS), and enables a longpolling to the Support server, optionally.
 *
 * @param {Widget} widget
 * @param {Object} params
 * @param {function} [params.mockSupportRPC]
 * @param {boolean} [params.enableSupportPoll=false]
 */
async function addMockSupportEnvironment(widget, params) {
    // mock CORS RPCs
    var originalRPC = supportSession.rpc;
    var defaultMockSupportRPC = function (route, args) {
        if (route === '/odoo_im_support/get_support_channel') {
            return Promise.resolve({
                available: true,
                channel_type: 'livechat',
                public: 'private',
                uuid: args.channel_uuid,
            });
        }
        if (route === '/odoo_im_support/fetch_messages') { // fetching history
            return Promise.resolve([]);
        }
        if (route === '/odoo_im_support/chat_post') {
            return Promise.resolve();
        }
        if (route === '/longpolling/support_poll') {
            return Promise.resolve();
        }
    };
    supportSession.rpc = function (route, args) {
        var result;
        if (params.mockSupportRPC) {
            var _super = this._super;
            this._super = defaultMockSupportRPC.bind(this, route, args);
            result = params.mockSupportRPC.apply(this, arguments);
            this._super = _super;
        } else {
            result = defaultMockSupportRPC.apply(this, arguments);
        }
        return result;
    };
    await testUtils.mock.addMockEnvironment(widget, params);
    var widgetDestroy = widget.destroy;
    widget.destroy = function () {
        supportSession.rpc = originalRPC;
        widgetDestroy.call(this);
    };
}

return {
    addMockSupportEnvironment: addMockSupportEnvironment,
};

});
