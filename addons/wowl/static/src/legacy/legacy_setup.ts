import { Component, config, tags, utils } from "@odoo/owl";
import { serviceRegistry } from "../services/service_registry";
import { systrayRegistry } from "../webclient/systray_registry";
import {
  makeLegacyActionManagerService,
  makeLegacyRpcService,
  makeLegacySessionService,
} from "./legacy";

let legacySetupResolver: (...args: any[]) => void;

export const legacySetupProm = new Promise((resolve) => {
  legacySetupResolver = resolve;
});

const { whenReady } = utils;
const odoo = (window as any).odoo;

odoo.define("wowl.legacySetup", async function (require: any) {
  // build the legacy env and set it on owl.Component (this was done in main.js,
  // with the starting of the webclient)
  const AbstractService = require("web.AbstractService");
  const legacyEnv = require("web.env");
  const session = require("web.session");
  const makeLegacyWebClientService = require("wowl.pseudo_web_client");

  config.mode = legacyEnv.isDebug() ? "dev" : "prod";
  AbstractService.prototype.deployServices(legacyEnv);
  Component.env = legacyEnv;

  const legacyActionManagerService = makeLegacyActionManagerService(legacyEnv);
  serviceRegistry.add(legacyActionManagerService.name, legacyActionManagerService);
  // add a service to redirect rpc events triggered on the bus in the
  // legacy env on the bus in the wowl env
  const legacyRpcService = makeLegacyRpcService(legacyEnv);
  serviceRegistry.add(legacyRpcService.name, legacyRpcService);

  const legacySessionService = makeLegacySessionService(legacyEnv, session);
  serviceRegistry.add(legacySessionService.name, legacySessionService);

  const legacyWebClientService = makeLegacyWebClientService(legacyEnv);
  serviceRegistry.add(legacyWebClientService.name, legacyWebClientService);

  await Promise.all([whenReady(), session.is_bound]);
  legacyEnv.qweb.addTemplates(session.owlTemplates);
  legacySetupResolver(legacyEnv);
});

odoo.define("wowl.legacySystrayMenuItems", function (require: any) {
  require("wowl.legacySetup");
  const { ComponentAdapter } = require("web.OwlCompatibility");
  const legacySystrayMenu = require("web.SystrayMenu");

  class SystrayItemAdapter extends ComponentAdapter {
    env = Component.env;
  }

  const legacySystrayMenuItems = legacySystrayMenu.Items as any[];
  // registers the legacy systray menu items from the legacy systray registry
  // to the wowl one, but wrapped into Owl components
  legacySystrayMenuItems.forEach((item, index) => {
    const name = `_legacy_systray_item_${index}`;

    class SystrayItem extends Component {
      static template = tags.xml`<SystrayItemAdapter Component="Widget" />`;
      static components = { SystrayItemAdapter };
      Widget = item;
    }

    systrayRegistry.add(name, {
      name,
      Component: SystrayItem,
      sequence: item.prototype.sequence,
    });
  });
});
