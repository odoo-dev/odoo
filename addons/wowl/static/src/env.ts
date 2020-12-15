import * as owl from "@odoo/owl";
import { deployServices } from "./services/deploy_services";
import { OdooEnv } from "./types";
import { OdooBrowser } from "./types";

export async function makeEnv(debug: string): Promise<OdooEnv> {
  const env: OdooEnv = {
    browser: owl.browser,
    qweb: new owl.QWeb(),
    bus: new owl.core.EventBus(),
    services: {} as any,
    debug,
  } as OdooEnv;

  // define shortcut properties coming from some services
  Object.defineProperty(env, "isSmall", {
    get() {
      if (!env.services.device) {
        throw new Error("Device service not initialized!");
      }
      return env.services.device.isSmall;
    },
  });
  Object.defineProperty(env, "_t", {
    get() {
      if (!env.services.localization) {
        throw new Error("Localization service not initialized!");
      }
      return env.services.localization._t;
    },
  });
  Object.defineProperty(env.qweb, "translateFn", {
    get() {
      if (!env.services.localization) {
        throw new Error("Localization service not initialized!");
      }
      return env.services.localization._t;
    },
  });

  await deployServices(env);

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
