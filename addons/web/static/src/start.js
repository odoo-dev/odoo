/** @odoo-module **/

import { makeEnv, startServices } from "./env";
import { legacySetupProm } from "./legacy/legacy_setup";
import { mapLegacyEnvToWowlEnv } from "./legacy/utils";
import { processTemplates } from "./core/assets";
import { session } from "@web/session";

const { App, whenReady } = owl;

/**
 * Function to start a webclient.
 * It is used both in community and enterprise in main.js.
 * It's meant to be webclient flexible so we can have a subclass of
 * webclient in enterprise with added features.
 *
 * @param {owl.Component} Webclient
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
        env: {
            ...env,
            renderToString(template, context) {
                const div = document.createElement("div");
                const templateFn = app.getTemplate(template);
                const bdom = templateFn(context);
                owl.blockDom.mount(bdom, div);
                return div.innerHTML;
            },
        },
        dev: env.debug,
        templates: templates.cloneNode(true),
    });
    const root = await app.mount(document.body);
    // delete odoo.debug; // FIXME: some legacy code rely on this
    odoo.__WOWL_DEBUG__ = { root };
    odoo.isReady = true;
}
