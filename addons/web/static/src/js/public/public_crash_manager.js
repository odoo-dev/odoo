odoo.define('web.PublicCrashManager', function (require) {
"use strict";

const core = require('web.core');
const CrashManager = require('web.CrashManager').CrashManager;

const PublicCrashManager = CrashManager.extend({

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _displayWarning(message, title, subtitle, options) {
        this.displayNotification({
            ...options,
            title,
            message,
            subtitle,
            sticky: true,
        });
    },
});

core.serviceRegistry.add('crash_manager', PublicCrashManager);

return {
    CrashManager: PublicCrashManager,
};

});
