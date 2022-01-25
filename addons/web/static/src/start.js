/** @odoo-module **/

import { makeEnv, startServices } from "./env";
import { legacySetupProm } from "./legacy/legacy_setup";
import { mapLegacyEnvToWowlEnv } from "./legacy/utils";
import { processTemplates } from "./core/assets";
import { localization } from "@web/core/l10n/localization";
import { _t } from "@web/core/l10n/translation";
import { session } from "@web/session";
import { renderToString } from "./core/utils/render";

const { App, whenReady } = owl;

/**
 * Function to start a webclient.
 * It is used both in community and enterprise in main.js.
 * It's meant to be webclient flexible so we can have a subclass of
 * webclient in enterprise with added features.
 *
 * @param {Component} Webclient
 */
export async function startWebClient(Webclient) {
    odoo.info = {
        db: session.db,
        server_version: session.server_version,
        server_version_info: session.server_version_info,
        isEnterprise: session.server_version_info.slice(-1)[0] === "e",
    };
    odoo.isReady = false;

    // setup environment
    const env = makeEnv();
    const [, templates] = await Promise.all([
        startServices(env),
        odoo.loadTemplatesPromise.then(processTemplates),
    ]);

    // start web client
    await whenReady();
    Object.defineProperty(window, "__ODOO_TEMPLATES__", {
        get() {
            return templates.cloneNode(true);
        },
    });
    const legacyEnv = await legacySetupProm;
    mapLegacyEnvToWowlEnv(legacyEnv, env);
    const app = new App(Webclient, {
        env,
        dev: env.debug,
        templates: templates.cloneNode(true),
        translatableAttributes: ["label", "title", "placeholder", "alt", "data-tooltip"],
        translateFn: _t,
    });
    renderToString.app = app;
    const root = await app.mount(document.body);
    const classList = document.body.classList;
    if (localization.direction === "rtl") {
        classList.add("o_rtl");
    }
    if (env.services.user.userId === 1) {
        classList.add("o_is_superuser");
    }
    // delete odoo.debug; // FIXME: some legacy code rely on this
    odoo.__WOWL_DEBUG__ = { root };
    odoo.isReady = true;
}
