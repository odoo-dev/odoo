odoo.define('mail.Manager', function (require) {
"use strict";

/**
 * Deprecated legacy code still kept for compatibility of activity menu.
 */
var AbstractService = require('web.AbstractService');

var Bus = require('web.Bus');

var MailManager = AbstractService.extend({
    dependencies: ['ajax', 'bus_service', 'local_storage'],

    /**
     * @override
     */
    start: function () {
        this._super.apply(this, arguments);
        this._initializeInternalState();
        this._listenOnBuses();
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @returns {web.Bus} the mail bus
     */
    getMailBus: function () {
        return this._mailBus;
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Initialize the internal state of the mail service. Ensure that all
     * attributes are set before doing any operation on them.
     *
     * @private
     */
    _initializeInternalState: function () {
        this._mailBus = new Bus(this);
    },
    /**
     * Listen on several buses, before doing any action that trigger something
     * on those buses.
     *
     * @private
     */
    _listenOnBuses: function () {
    },
});

return MailManager;

});
