import * as owl from "@odoo/owl";
import { deployServices } from "./services/deploy_services";
import { OdooConfig, OdooEnv } from "./types";
import { OdooBrowser } from "./types";

export async function makeEnv(config: OdooConfig): Promise<OdooEnv> {
  const { templates, _t, debug } = config;
  const qweb = new owl.QWeb({ translateFn: _t });
  qweb.addTemplates(templates);

  const env: OdooEnv = {
    browser: owl.browser,
    qweb,
    bus: new owl.core.EventBus(),
    services: {} as any,
    _t,
    debug,
  };

  // define shortcut properties coming from some services
  Object.defineProperty(env, "isSmall", {
    get() {
      if (!env.services.device) {
        throw new Error("Device service not initialized!");
      }
      return env.services.device.isSmall;
    },
  });

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
