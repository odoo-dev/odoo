import { Component, tags } from "@odoo/owl";
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
import { actionManagerService } from "./services/action_manager/action_manager";
import type { ComponentAction, FunctionAction } from "./services/action_manager/helpers";

// Services
//
// Services registered in this registry will be deployed in the env. A component
// can then call the hook 'useService' in init with the name of the service it
// needs.
const serviceRegistry: Registry<Service> = new Registry();

const services = [
  actionManagerService,
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

// Client Actions
//
// This registry contains client actions. A client action can be either a
// Component or a function. In the former case, the given Component will be
// instantiated and mounted in the DOM. In the latter, the function will be
// executed
export const actionRegistry: Registry<ComponentAction | FunctionAction> = new Registry();

// Demo code
class HelloAction extends Component {
  static template = tags.xml`<div>Hello World</div>`;
}
actionRegistry.add("Hello", HelloAction);

export const registries = {
  Components: mainComponentRegistry,
  services: serviceRegistry,
  actions: actionRegistry,
};

export type Registries = typeof registries;
