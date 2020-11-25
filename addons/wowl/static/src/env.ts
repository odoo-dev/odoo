import * as owl from "@odoo/owl";
import { deployServices } from "./services/deploy_services";
import { OdooConfig, OdooEnv } from "./types";
import { OdooBrowser } from "./types";

export async function makeEnv(config: OdooConfig): Promise<OdooEnv> {
  const {
    services,
    Components,
    actions,
    templates,
    views,
    _t,
    systray,
    errorDialogs,
    userMenu,
  } = config;
  const registries = { services, Components, views, actions, systray, errorDialogs, userMenu };
  const qweb = new owl.QWeb({ translateFn: _t });
  qweb.addTemplates(templates);

  const env: OdooEnv = {
    browser: owl.browser,
    qweb,
    bus: new owl.core.EventBus(),
    registries,
    services: {} as any,
    _t,
  };

  await deployServices(env, config);

  return env;
}

export function makeRAMLocalStorage(): OdooBrowser["localStorage"] {
  let store: any = {};
  return {
    setItem(key: string, value: string): void {
      store[key] = value;
    },
    getItem(key) {
      return store[key];
    },
    clear() {
      store = {};
    },
    removeItem(key) {
      delete store[key];
    },
    get length() {
      return Object.keys(store).length;
    },
    key() {
      return "";
    },
  };
}
