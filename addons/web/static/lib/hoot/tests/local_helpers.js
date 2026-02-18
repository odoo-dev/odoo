/** @odoo-module */

import { after, destroy, getFixture } from "@odoo/hoot";
import { App, Component, xml } from "@odoo/owl";

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

/**
 * @param {import("@odoo/owl").ComponentConstructor} ComponentClass
 * @param {Parameters<import("@odoo/owl").mount>[2]} [config]
 */
export async function mountForTest(ComponentClass, config) {
    if (typeof ComponentClass === "string") {
        ComponentClass = class extends Component {
            static name = "anonymous component";
            static template = xml`${ComponentClass}`;
        };
    }

    const app = new App({
        name: "TEST",
        test: true,
        ...config,
    });
    const fixture = getFixture();

    after(() => destroy(app));

    fixture.style.backgroundColor = "#fff";
    await app.createRoot(ComponentClass).mount(fixture);
    if (fixture.hasIframes) {
        await fixture.waitForIframes();
    }
}

/**
 * @param {string} url
 */
export function parseUrl(url) {
    return url.replace(/^.*hoot\/tests/, "@hoot").replace(/(\.test)?\.js$/, "");
}
