import { Component, config, utils } from "@odoo/owl";
import { serviceRegistry } from "../registries";
import { makeLegacyActionManagerService, makeLegacyRpcService } from "./legacy";

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

  config.mode = legacyEnv.isDebug() ? "dev" : "prod";
  AbstractService.prototype.deployServices(legacyEnv);
  Component.env = legacyEnv;

  const legacyActionManagerService = makeLegacyActionManagerService(legacyEnv);
  serviceRegistry.add(legacyActionManagerService.name, legacyActionManagerService);
  // add a service to redirect rpc events triggered on the bus in the
  // legacy env on the bus in the wowl env
  const legacyRpcService = makeLegacyRpcService(legacyEnv);
  serviceRegistry.add(legacyRpcService.name, legacyRpcService);

  await Promise.all([whenReady(), session.is_bound]);
  legacyEnv.qweb.addTemplates(session.owlTemplates);
  legacySetupResolver(legacyEnv);
});
