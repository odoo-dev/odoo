import { Component } from "@odoo/owl";
import { OdooEnv, Services } from "../types";

// -----------------------------------------------------------------------------
// Hook function
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
