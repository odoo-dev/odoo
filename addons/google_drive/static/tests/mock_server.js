/** @odoo-module */

import LegacyMockServer from "web.MockServer";
import { MockServer } from "@web/../tests/helpers/mock_server";
import { patch } from "@web/core/utils/patch";


function getDefaultConfig(route, args) {
    if (args.method === 'get_google_drive_config') {
        return [];
    }
}

patch(MockServer.prototype, 'google_drive', {
    _performRPC() {
        return getDefaultConfig(...arguments) || this._super(...arguments);
    }
});


LegacyMockServer.include({
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     * @private
     */
    async _performRpc(route, args) {
        return getDefaultConfig(...arguments) || this._super(...arguments);
    },
});
