/** @odoo-module **/
import { App, whenReady } from "@odoo/owl";
import { PublicReadonlySpreadsheet } from "./public_readonly";
import { setLoadXmlDefaultApp, templates } from "@web/core/assets";
import { makeEnv, startServices } from "@web/env";
import { session } from "@web/session";

(async function boot() {
    odoo.info = {
        db: session.db,
        server_version: session.server_version,
        server_version_info: session.server_version_info,
        isEnterprise: session.server_version_info.slice(-1)[0] === "e",
    };
    odoo.isReady = false;
    const env = makeEnv();
    await startServices(env);
    await whenReady();
    const app = new App(PublicReadonlySpreadsheet, {
        env,
        props: session.spreadsheet_public_props,
        templates,
        translateFn: env._t,
        dev: env.debug,
        warnIfNoStaticProps: env.debug,
        translatableAttributes: ["data-tooltip"],
    });
    setLoadXmlDefaultApp(app);
    const root = await app.mount(document.getElementById("spreadsheet-mount-anchor"));
    odoo.__WOWL_DEBUG__ = { root };
    odoo.isReady = true;
})();
