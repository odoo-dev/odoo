/** @odoo-module */

import { serviceRegistry } from "@web/core/service_registry";
import { uiService } from "@web/core/ui_service";
import { patch, unpatch } from "@web/core/utils/patch";
import { makeLegacyDialogMappingService } from "@web/legacy/utils";
import { hotkeyService } from "@web/webclient/hotkeys/hotkey_service";
import core from "web.core";
import makeTestEnvironment from "web.test_env";
import { registerCleanup } from "./cleanup";
import { makeTestEnv } from "./mock_env";

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
