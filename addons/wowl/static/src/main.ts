import * as owl from "@odoo/owl";
import { WebClient } from "./webclient/webclient";
import { fetchLocalization } from "./core/localization";
import { makeEnv, makeRAMLocalStorage } from "./env";
import * as registries from "./registries";
import { Odoo, RuntimeOdoo } from "./types";

// remove some day
import "./demo_data";
import { legacySetupProm } from "./legacy/legacy_setup";
import { mapLegacyEnvToWowlEnv } from "./legacy/legacy";
import "./legacy/root_widget";
import "./legacy/systray_menu";
import "./legacy/web_client";

const { whenReady, loadFile } = owl.utils;

declare const odoo: Odoo;

(async () => {
  // prepare browser object
  let localStorage: Window["localStorage"] = owl.browser.localStorage;
  try {
    // Safari crashes in Private Browsing
    localStorage.setItem("__localStorage__", "true");
    localStorage.removeItem("__localStorage__");
  } catch (e) {
    localStorage = makeRAMLocalStorage();
  }
  odoo.browser = odoo.browser || {};
  odoo.browser = Object.assign(odoo.browser, owl.browser, {
    console: window.console,
    location: window.location,
    navigator: navigator,
    open: window.open.bind(window),
    XMLHttpRequest: window.XMLHttpRequest,
    localStorage,
  });

  // load templates and localization
  let [templates, { localization, _t }] = await Promise.all([loadTemplates(), fetchLocalization()]);

  // setup environment
  const env = await makeEnv({
    localization,
    debug: odoo.debug,
    views: registries.viewRegistry,
    Components: registries.mainComponentRegistry,
    services: registries.serviceRegistry,
    actions: registries.actionRegistry,
    systray: registries.systrayRegistry,
    errorDialogs: registries.errorDialogRegistry,
    userMenu: registries.userMenuRegistry,
    templates,
    _t,
  });
  WebClient.env = env;

  // start web client
  const root = new WebClient();
  await whenReady();
  const legacyEnv = await legacySetupProm;
  mapLegacyEnvToWowlEnv(legacyEnv, env);

  await root.mount(document.body, { position: "self" });
  // the chat window and dialog services listen to 'web_client_ready' event in order to initialize themselves:
  env.bus.trigger("WEB_CLIENT_READY");

  // prepare runtime Odoo object
  const sessionInfo = odoo.session_info;
  // delete (odoo as any).session_info; // FIXME: some legacy code rely on this (e.g. ajax.js)
  delete (odoo as any).debug;
  ((odoo as any) as RuntimeOdoo).__WOWL_DEBUG__ = { root };
  ((odoo as any) as RuntimeOdoo).info = {
    db: sessionInfo.db,
    server_version: sessionInfo.server_version,
    server_version_info: sessionInfo.server_version_info,
  };
})();

async function loadTemplates(): Promise<string> {
  const templatesUrl = `/wowl/templates/${odoo.session_info.qweb}`;
  const templates = await loadFile(templatesUrl);

  // as we currently have two qweb engines (owl and legacy), owl templates are
  // flagged with attribute `owl="1"`. The following lines removes the 'owl'
  // attribute from the templates, so that it doesn't appear in the DOM. For now,
  // we make the assumption that 'templates' only contains owl templates. We
  // might need at some point to handle the case where we have both owl and
  // legacy templates. At the end, we'll get rid of all this.
  const doc = new DOMParser().parseFromString(templates, "text/xml");
  for (let child of doc.querySelectorAll("templates > [owl]")) {
    child.removeAttribute("owl");
  }
  return new XMLSerializer().serializeToString(doc);
}
