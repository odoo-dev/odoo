/** @odoo-module **/

import core from "web.core";
import session from "web.session";
import { browser, makeRAMLocalStorage } from "@web/core/browser/browser";
import { patchWithCleanup } from "@web/../tests/helpers/utils";
import { legacyProm } from "web.test_legacy";
import { registerCleanup } from "./helpers/cleanup";
import { prepareRegistriesWithCleanup } from "./helpers/mock_env";
import { getMockSessionInfo } from "./helpers/mock_session_info";

const { whenReady, loadFile } = owl.utils;

owl.config.enableTransitions = false;
owl.QWeb.dev = true;

function forceLocaleAndTimezoneWithCleanup() {
    const originalLocale = luxon.Settings.defaultLocale;
    luxon.Settings.defaultLocale = "en";
    const originalZoneName = luxon.Settings.defaultZoneName;
    luxon.Settings.defaultZoneName = "Europe/Brussels";
    registerCleanup(() => {
        luxon.Settings.defaultLocale = originalLocale;
        luxon.Settings.defaultZoneName = originalZoneName;
    });
}

function makeMockLocation() {
    const locationLink = Object.assign(document.createElement("a"), {
        href: window.location.origin + window.location.pathname,
        assign(url) {
            this.href = url;
        },
        reload() {},
    });
    return new Proxy(locationLink, {
        get(target, p) {
            return target[p];
        },
        set(target, p, value) {
            target[p] = value;
            if (p === "hash") {
                window.dispatchEvent(new HashChangeEvent("hashchange"));
            }
            return true;
        },
    });
}

function patchBrowserWithCleanup() {
    const originalAddEventListener = browser.addEventListener;
    const originalRemoveEventListener = browser.removeEventListener;
    const mockLocation = makeMockLocation();
    patchWithCleanup(
        browser,
        {
            // patch addEventListner to automatically remove listeners bound (via
            // browser.addEventListener) during a test (e.g. during the deployment of a service)
            addEventListener() {
                originalAddEventListener(...arguments);
                registerCleanup(() => {
                    originalRemoveEventListener(...arguments);
                });
            },
            // in tests, we never want to interact with the real url or reload the page
            location: mockLocation,
            history: {
                pushState(state, title, url) {
                    mockLocation.assign(url);
                },
                replaceState(state, title, url) {
                    mockLocation.assign(url);
                },
            },
            // in tests, we never want to interact with the real local/session storages.
            localStorage: makeRAMLocalStorage(),
            sessionStorage: makeRAMLocalStorage(),
        },
        { pure: true }
    );
}

function patchLegacyCoreBus() {
    // patch core.bus.on to automatically remove listners bound on the legacy bus
    // during a test (e.g. during the deployment of a service)
    const originalOn = core.bus.on.bind(core.bus);
    const originalOff = core.bus.off.bind(core.bus);
    patchWithCleanup(core.bus, {
        on() {
            originalOn(...arguments);
            registerCleanup(() => {
                originalOff(...arguments);
            });
        },
    });
}

function patchLegacySession() {
    const userContext = Object.getOwnPropertyDescriptor(session, "user_context");
    registerCleanup(() => {
        Object.defineProperty(session, "user_context", userContext);
    });
}

function patchOdoo() {
    patchWithCleanup(odoo, {
        debug: "",
        session_info: getMockSessionInfo(),
    });
}

export async function setupTests() {
    QUnit.testStart(() => {
        prepareRegistriesWithCleanup();
        forceLocaleAndTimezoneWithCleanup();
        patchBrowserWithCleanup();
        patchLegacyCoreBus();
        patchLegacySession();
        patchOdoo();
    });

    const templatesUrl = `/web/webclient/qweb/${new Date().getTime()}?bundle=web.assets_qweb`;
    // TODO replace by `processTemplates` when the legacy system is removed
    let templates = await loadFile(templatesUrl);
    // as we currently have two qweb engines (owl and legacy), owl templates are
    // flagged with attribute `owl="1"`. The following lines removes the 'owl'
    // attribute from the templates, so that it doesn't appear in the DOM. For now,
    // we make the assumption that 'templates' only contains owl templates. We
    // might need at some point to handle the case where we have both owl and
    // legacy templates. At the end, we'll get rid of all this.
    const doc = new DOMParser().parseFromString(templates, "text/xml");
    const owlTemplates = [];
    for (let child of doc.querySelectorAll("templates > [owl]")) {
        child.removeAttribute("owl");
        owlTemplates.push(child.outerHTML);
    }
    templates = `<templates> ${owlTemplates.join("\n")} </templates>`;
    window.__ODOO_TEMPLATES__ = templates;
    await Promise.all([whenReady(), legacyProm]);
}
