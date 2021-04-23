/** @odoo-module */

import makeTestEnvironment from "web.test_env";
import core from "web.core";
import { serviceRegistry } from "@web/webclient/service_registry";
import { hotkeyService } from "@web/hotkeys/hotkey_service";
import { uiService } from "@web/services/ui_service";
import { makeTestEnv } from "./mock_env";
import { makeLegacyDialogMappingService } from "@web/legacy/utils";
import { registerCleanup } from "./cleanup";
import { patch, unpatch } from "@web/utils/patch";

export async function makeLegacyDialogMappingTestEnv() {
  const coreBusListeners = [];
  patch(core.bus, "legacy.core.bus.listeners", {
    on(eventName, thisArg, callback) {
      this._super(...arguments);
      coreBusListeners.push({ eventName, callback });
    },
  });

  const legacyEnv = makeTestEnvironment({ bus: core.bus });
  serviceRegistry.add("ui", uiService);
  serviceRegistry.add("hotkey", hotkeyService);
  serviceRegistry.add("legacy_dialog_mapping", makeLegacyDialogMappingService(legacyEnv));

  const env = await makeTestEnv();

  registerCleanup(() => {
    for (const listener of coreBusListeners) {
      core.bus.off(listener.eventName, listener.callback);
    }
    unpatch(core.bus, "legacy.core.bus.listeners");
  });

  return {
    legacyEnv,
    env,
  };
}
