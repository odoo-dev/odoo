import * as owl from "@odoo/owl";
import { OdooConfig, OdooEnv, Service } from "./types";

export async function makeEnv(config: OdooConfig): Promise<OdooEnv> {
  const {
    browser,
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
    browser,
    qweb,
    bus: new owl.core.EventBus(),
    registries,
    services: {} as any,
    _t,
  };

  await deployServices(env, config);
  return env;
}

async function deployServices(env: OdooEnv, config: OdooConfig): Promise<void> {
  const services = env.services;
  const serviceRegistry = config.services;
  const toBeDeployed = new Set(serviceRegistry.getAll());
  // deploy as many services in parallel as possible
  function deploy(): Promise<any> {
    let service: Service | null = null;
    const proms: Promise<any>[] = [];

    while ((service = findNext())) {
      let name = service.name;
      toBeDeployed.delete(service);
      const value = service.deploy(env, config);
      if (value instanceof Promise) {
        proms.push(
          value.then((val) => {
            services[name] = val || null;
            return deploy();
          })
        );
      } else {
        services[service.name] = value || null;
      }
    }
    return Promise.all(proms);
  }

  await deploy();

  if (toBeDeployed.size) {
    throw new Error(`Some services could not be deployed: ${[...toBeDeployed].map((s) => s.name)}`);
  }

  function findNext(): Service | null {
    for (let s of toBeDeployed) {
      if (s.dependencies) {
        if (s.dependencies.every((d) => d in services)) {
          return s;
        }
      } else {
        return s;
      }
    }
    return null;
  }
}

import { OdooBrowser } from "./types";

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
