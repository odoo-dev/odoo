/** @odoo-module */

import LegacyMockServer from "web.MockServer";
import { MockServer } from "@web/../tests/helpers/mock_server";
import { patch } from "@web/utils/patch";

LegacyMockServer.include({
  //--------------------------------------------------------------------------
  // Private
  //--------------------------------------------------------------------------

  /**
   * @override
   * @private
   */
  async _performRpc(route, args) {
    if (args.method === "get_google_drive_config") {
      return [];
    }
    return this._super(...arguments);
  },
});

patch(MockServer.prototype, "google_drive.MockServer", {
  async _performRPC(route, args) {
    if (args.method === "get_google_drive_config") {
      return [];
    }
    return this._super(...arguments);
  },
});
