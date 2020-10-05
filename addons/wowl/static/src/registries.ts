import { Component } from "@odoo/owl";
import { menusService } from "./services/menus";
import { NotificationManager, notificationService } from "./services/notifications";
import { Registry } from "./core/registry";
import { routerService } from "./services/router";
import { rpcService } from "./services/rpc";
import { userService } from "./services/user";
import { Service } from "./services";
import { Type } from "./types";
import { crashManagerService } from "./services/crash_manager";
import { modelService } from "./services/model";

// Services
//
// Services registered in this registry will be deployed in the env. A component
// can then call the hook 'useService' in init with the name of the service it
// needs.
const serviceRegistry: Registry<Service> = new Registry();

const services = [
  menusService,
  crashManagerService,
  modelService,
  notificationService,
  routerService,
  rpcService,
  userService,
];

for (let service of services) {
  serviceRegistry.add(service.name, service);
}

// Main Components
//
// Components registered in this registry will be rendered inside the root node
// of the webclient.
const mainComponentRegistry: Registry<Type<Component>> = new Registry();

mainComponentRegistry.add("NotificationManager", NotificationManager);

export const registries = {
  Components: mainComponentRegistry,
  services: serviceRegistry,
};

export type Registries = typeof registries;
