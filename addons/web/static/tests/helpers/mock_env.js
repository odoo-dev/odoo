/** @odoo-module **/

import { debugRegistry } from "@web/core/debug/debug_registry";
import { errorDialogRegistry } from "@web/core/errors/error_dialog_registry";
import { errorHandlerRegistry } from "@web/core/errors/error_handler_registry";
import { mainComponentRegistry } from "@web/core/main_component_registry";
import { serviceRegistry } from "@web/core/service_registry";
import { systrayRegistry } from "@web/core/systray_registry";
import { makeEnv, startServices } from "@web/env";
import { viewRegistry } from "@web/views/view_registry";
import { actionRegistry } from "@web/webclient/actions/action_registry";
import { commandCategoryRegistry } from "@web/webclient/commands/command_category_registry";
import { userMenuRegistry } from "@web/webclient/user_menu/user_menu_registry";
import FormController from "web.FormController";
import { registerCleanup } from "./cleanup";
import { makeMockServer } from "./mock_server";
import { mocks } from "./mock_services";
import { patchWithCleanup } from "./utils";

export function clearRegistryWithCleanup(registry) {
    const patch = {
        content: {},
        elements: null,
        entries: null,
        // Preserve OnUpdate handlers
        subscriptions: { UPDATE: [...registry.subscriptions.UPDATE] },
    };
    patchWithCleanup(registry, patch);
}

function cloneRegistryWithCleanup(registry) {
    const patch = {
        content: { ...registry.content },
        elements: null,
        entries: null,
        // Preserve OnUpdate handlers
        subscriptions: { UPDATE: [...registry.subscriptions.UPDATE] },
    };
    patchWithCleanup(registry, patch);
}

export function prepareRegistriesWithCleanup() {
    // Clone registries
    cloneRegistryWithCleanup(actionRegistry);
    cloneRegistryWithCleanup(viewRegistry);
    cloneRegistryWithCleanup(errorHandlerRegistry);

    cloneRegistryWithCleanup(mainComponentRegistry);

    // Clear registries
    clearRegistryWithCleanup(commandCategoryRegistry);
    clearRegistryWithCleanup(debugRegistry);
    clearRegistryWithCleanup(errorDialogRegistry);

    clearRegistryWithCleanup(serviceRegistry);
    clearRegistryWithCleanup(systrayRegistry);
    clearRegistryWithCleanup(userMenuRegistry);
}

/**
 * @typedef {import("@web/env").OdooEnv} OdooEnv
 */

/**
 * Create a test environment
 *
 * @param {*} config
 * @returns {Promise<OdooEnv>}
 */
export async function makeTestEnv(config = {}) {
    // add all missing dependencies if necessary
    for (let service of serviceRegistry.getAll()) {
        if (service.dependencies) {
            for (let dep of service.dependencies) {
                if (dep in mocks && !serviceRegistry.contains(dep)) {
                    serviceRegistry.add(dep, mocks[dep]());
                }
            }
        }
    }

    if (config.serverData || config.mockRPC || config.activateMockServer) {
        makeMockServer(config.serverData, config.mockRPC);
    }

    // remove the multi-click delay for the quick edit in form views
    // todo: move this elsewhere (setup?)
    const initialQuickEditDelay = FormController.prototype.multiClickTime;
    FormController.prototype.multiClickTime = 0;
    registerCleanup(() => {
        FormController.prototype.multiClickTime = initialQuickEditDelay;
    });

    setTestOdooWithCleanup(config);
    const env = makeEnv(odoo.debug);
    await startServices(env);
    env.qweb.addTemplates(window.__ODOO_TEMPLATES__);
    return env;
}

export function setTestOdooWithCleanup(config = {}) {
    const originalOdoo = odoo;
    registerCleanup(() => {
        odoo = originalOdoo;
    });
    odoo = Object.assign({}, originalOdoo, {
        browser: {},
        debug: config.debug || "",
        session_info: {
            cache_hashes: {
                load_menus: "161803",
                translations: "314159",
            },
            currencies: {
                1: { name: "USD", digits: [69, 2], position: "before", symbol: "$" },
                2: { name: "EUR", digits: [69, 2], position: "after", symbol: "€" },
            },
            user_context: {
                lang: "en",
                uid: 7,
                tz: "taht",
            },
            qweb: "owl",
            uid: 7,
            name: "Mitchell",
            username: "The wise",
            is_admin: true,
            partner_id: 7,
            // Commit: 3e847fc8f499c96b8f2d072ab19f35e105fd7749
            // to see what user_companies is
            user_companies: {
                allowed_companies: { 1: { id: 1, name: "Hermit" } },
                current_company: 1,
            },
            db: "test",
            server_version: "1.0",
            server_version_info: ["1.0"],
        },
    });
}
