import * as owl from "@odoo/owl";
import { WebClient } from "./components/webclient/webclient";
import { makeEnv, OdooBrowser } from "./env";
import { registries } from "./registries";
import { Odoo, RuntimeOdoo } from "./types";

const { whenReady, loadFile } = owl.utils;

declare const odoo: Odoo;

(async () => {
  // load templates
  const templatesUrl = `/wowl/templates/${odoo.session_info.qweb}`;
  const templates = await loadFile(templatesUrl);

  // prepare browser object
  const c = new owl.Component();
  const baseEnv = c.env;
  const browser: OdooBrowser = Object.assign({}, baseEnv.browser, {
    XMLHttpRequest: window.XMLHttpRequest,
    console: window.console,
  });

  // setup environment
  const env = await makeEnv({ browser, odoo, registries, templates });
  owl.Component.env = env;

  // start web client
  const root = new WebClient();
  await whenReady();
  await root.mount(document.body);

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
