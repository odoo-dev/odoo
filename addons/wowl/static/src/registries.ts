import { Component, tags } from "@odoo/owl";
import { Registry } from "./core/registry";
import { actionManagerService } from "./services/action_manager/action_manager";
import { crashManagerService } from "./services/crash_manager";
import { menusService } from "./services/menus";
import { modelService } from "./services/model";
import { NotificationManager, notificationService } from "./services/notifications";
import { routerService } from "./services/router";
import { rpcService } from "./services/rpc";
import { userService } from "./services/user";
import { viewManagerService } from "./services/view_manager";
import { ComponentAction, FunctionAction, Service, Type, View } from "./types";
import { FormView } from "./views/form_view";
import { ListView } from "./views/list_view";

// -----------------------------------------------------------------------------
// Services
// -----------------------------------------------------------------------------

// Services registered in this registry will be deployed in the env. A component
// can then call the hook 'useService' in init with the name of the service it
// needs.
export const serviceRegistry: Registry<Service<any>> = new Registry();

const services = [
  actionManagerService,
  menusService,
  crashManagerService,
  modelService,
  notificationService,
  routerService,
  rpcService,
  userService,
  viewManagerService,
];

for (let service of services) {
  serviceRegistry.add(service.name, service);
}

// -----------------------------------------------------------------------------
// Main Components
// -----------------------------------------------------------------------------

// Components registered in this registry will be rendered inside the root node
// of the webclient.
export const mainComponentRegistry: Registry<Type<Component>> = new Registry();

mainComponentRegistry.add("NotificationManager", NotificationManager);

// -----------------------------------------------------------------------------
// Client Actions
// -----------------------------------------------------------------------------

// This registry contains client actions. A client action can be either a
// Component or a function. In the former case, the given Component will be
// instantiated and mounted in the DOM. In the latter, the function will be
// executed
export const actionRegistry: Registry<ComponentAction | FunctionAction> = new Registry();

// Demo code
class HelloAction extends Component {
  static template = tags.xml`<div>Discuss ClientAction</div>`;
}
actionRegistry.add("mail.widgets.discuss", HelloAction);
// actionRegistry.add("mail.widgets.discuss", () => console.log("I'm a function client action"));

// -----------------------------------------------------------------------------
// Views
// -----------------------------------------------------------------------------

const views: View[] = [FormView, ListView];

export const viewRegistry: Registry<View> = new Registry();

for (let view of views) {
  viewRegistry.add(view.name, view);
}
