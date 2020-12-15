import { Payload } from "../core/registry";
import { OdooEnv, Service } from "../types";
import { serviceRegistry } from "./service_registry";

export async function deployServices(env: OdooEnv): Promise<void> {
  const toDeploy: Set<Service> = new Set();
  let timeoutId: number | undefined;

  serviceRegistry.on("UPDATE", null, async (payload: Payload<Service>) => {
    const { operation, value } = payload;
    if (operation === "delete") {
      // We hardly see why it would be usefull to remove a service.
      // Furthermore we could encounter problems with dependencies.
      // Keep it simple!
      return;
    }
    if (toDeploy.size) {
      toDeploy.add(value);
    } else {
      timeoutId = await _deployServices(env, toDeploy, timeoutId);
    }
  });

  timeoutId = await _deployServices(env, toDeploy, timeoutId);
}

async function _deployServices(
  env: OdooEnv,
  toDeploy: Set<Service>,
  timeoutId: number | undefined
): Promise<number | undefined> {
  const services = env.services;
  odoo.serviceRegistry;
  for (const service of odoo.serviceRegistry.getAll()) {
    if (!(service.name in services)) {
      toDeploy.add(service);
    }
  }

  // deploy as many services in parallel as possible
  function deploy(): Promise<any> {
    let service: Service | null = null;
    const proms: Promise<any>[] = [];

    while ((service = findNext())) {
      let name = service.name;
      toDeploy.delete(service);
      const serviceEnv = Object.create(env);
      serviceEnv.services = {};
      if (service.dependencies) {
        for (let dep of service.dependencies) {
          serviceEnv.services[dep] = env.services[dep];
        }
      }
      const value = service.deploy(serviceEnv);
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

  clearTimeout(timeoutId);
  timeoutId = undefined;
  if (toDeploy.size) {
    const names = [...toDeploy].map((s) => s.name);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      throw new Error(`Some services could not be deployed: ${names}`);
    }, 15000);
    toDeploy.clear();
  }

  return timeoutId;

  function findNext(): Service | null {
    for (let s of toDeploy) {
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
