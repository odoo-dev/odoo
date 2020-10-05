import { Component } from "@odoo/owl";
import { OdooEnv } from "./env";
import { Odoo } from "./types";
import { Registry } from "./core/registry";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
type Unwrap<T> = T extends Promise<infer U> ? U : T;
type ServiceType<T extends (...args: any[]) => any> = Unwrap<ReturnType<T>>;

// add here each service type to have better typing for useService
import type { rpcService } from "./services/rpc";
import type { menusService } from "./services/menus";
import type { notificationService } from "./services/notifications";
import type { userService } from "./services/user";
import { routerService } from "./services/router";
import { modelService } from "./services/model";

export interface Services {
  menus: ServiceType<typeof menusService["deploy"]>;
  model: ServiceType<typeof modelService["deploy"]>;
  notifications: ServiceType<typeof notificationService["deploy"]>;
  rpc: ServiceType<typeof rpcService["deploy"]>;
  router: ServiceType<typeof routerService["deploy"]>;
  user: ServiceType<typeof userService["deploy"]>;

  [key: string]: any;
}

export interface Service<T = any> {
  name: string;
  dependencies?: string[];
  deploy: (env: OdooEnv, odoo: Odoo) => Promise<T> | T;
}

// -----------------------------------------------------------------------------
// Hook, registry and deploy function
// -----------------------------------------------------------------------------
export function useService<T extends keyof Services>(serviceName: T): Services[T] {
  const component = Component.current as Component<any, OdooEnv>;
  const env = component.env;
  const service = env.services[serviceName];
  if (!service) {
    throw new Error(`Service ${serviceName} is not available`);
  }
  return typeof service === "function" ? service.bind(component) : service;
}

export const serviceRegistry = new Registry<Service<any>>();

export async function deployServices(
  env: OdooEnv,
  registry: Registry<Service<any>>,
  odoo: Odoo
): Promise<void> {
  const services = env.services;
  const toBeDeployed = new Set(registry.getAll());

  // deploy as many services in parallel as possible
  function deploy(): Promise<any> {
    let service: Service | null = null;
    const proms: Promise<any>[] = [];

    while ((service = findNext())) {
      let name = service.name;
      toBeDeployed.delete(service);
      const value = service.deploy(env, odoo);
      if (value instanceof Promise) {
        proms.push(
          value.then((val) => {
            services[name] = val;
            return deploy();
          })
        );
      } else {
        services[service.name] = value;
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
