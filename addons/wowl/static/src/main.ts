import * as owl from "@odoo/owl";
import { WebClient } from "./components/webclient/webclient";
import { fetchLocalization } from "./core/localization";
import { makeEnv } from "./env";
import * as registries from "./registries";
import { Odoo, RuntimeOdoo, OdooBrowser } from "./types";

// remove some day
import "./demo_data";

const { whenReady, loadFile } = owl.utils;

declare const odoo: Odoo;

(async () => {
  // prepare browser object
  const c = new owl.Component();
  const baseEnv = c.env;
  const browser: OdooBrowser = Object.assign({}, baseEnv.browser, {
    console: window.console,
    location: window.location,
    navigator: navigator,
    open: window.open.bind(window),
    XMLHttpRequest: window.XMLHttpRequest,
  });

  // load templates and localization
  let [templates, { localization, _t }] = await Promise.all([
    loadTemplates(),
    fetchLocalization(browser, odoo),
  ]);

  // setup environment
  const env = await makeEnv({
    browser,
    localization,
    odoo,
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
  owl.Component.env = env;

  // start web client
  const root = new WebClient();
  await whenReady();
  await root.mount(document.body, { position: "self" });

  // prepare runtime Odoo object
  const sessionInfo = odoo.session_info;
  delete (odoo as any).session_info;
  ((odoo as any) as RuntimeOdoo).__DEBUG__ = { root };
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
