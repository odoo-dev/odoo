import { Component } from "@odoo/owl";
import { actionManagerService } from "./action_manager/action_manager";
import { Registry } from "./core/registry";
import { crashManagerService } from "./crash_manager/crash_manager_service";
import { notificationService } from "./notifications/notification_service";
import { cookieService } from "./services/cookie";
import { dialogManagerService } from "./services/dialog_manager";
import { menusService } from "./services/menus";
import { modelService } from "./services/model";
import { routerService } from "./services/router";
import { rpcService } from "./services/rpc";
import { titleService } from "./services/title";
import { uiService } from "./services/ui/ui";
import { userService } from "./services/user";
import { viewManagerService } from "./services/view_manager";
import { Service, SystrayItem, Type } from "./types";
import { LoadingIndicator } from "./webclient/loading_indicator/loading_indicator";
import { userMenu, UserMenuItemFactory } from "./webclient/user_menu/user_menu";
// import { FormView } from "./views/form_view";
// import { GraphView } from "./views/graph_view";
// import { KanbanView } from "./views/kanban_view";
// import { ListView } from "./views/list_view";
// import { PivotView } from "./views/pivot_view";
import {
  documentationItem,
  logOutItem,
  odooAccountItem,
  preferencesItem,
  shortCutsItem,
  supportItem,
} from "./webclient/user_menu/user_menu_items";

export { errorDialogRegistry } from "./crash_manager/error_dialog_registry";
// -----------------------------------------------------------------------------
// Services
// -----------------------------------------------------------------------------

// Services registered in this registry will be deployed in the env. A component
// can then call the hook 'useService' in init with the name of the service it
// needs.
export const serviceRegistry: Registry<Service<any>> = new Registry();

const services = [
  actionManagerService,
  crashManagerService,
  cookieService,
  dialogManagerService,
  titleService,
  menusService,
  modelService,
  notificationService,
  routerService,
  rpcService,
  uiService,
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

mainComponentRegistry.add("LoadingIndicator", LoadingIndicator);

// -----------------------------------------------------------------------------
// Client Actions
// -----------------------------------------------------------------------------

export { actionRegistry } from "./action_manager/action_registry";
// -----------------------------------------------------------------------------
// Views
// -----------------------------------------------------------------------------
// const views: View[] = [FormView, GraphView, KanbanView, ListView, PivotView];
export { viewRegistry } from "./views/view_registry";

// for (let view of views) {
//   viewRegistry.add(view.name, view);
// }

// -----------------------------------------------------------------------------
// Systray
// -----------------------------------------------------------------------------

export const systrayRegistry: Registry<SystrayItem> = new Registry();

systrayRegistry.add("wowl.user_menu", userMenu);

// -----------------------------------------------------------------------------
// Default UserMenu items
// -----------------------------------------------------------------------------

export const userMenuRegistry: Registry<UserMenuItemFactory> = new Registry();

userMenuRegistry
  .add("documentation", documentationItem)
  .add("support", supportItem)
  .add("shortcuts", shortCutsItem)
  .add("profile", preferencesItem)
  .add("odoo_account", odooAccountItem)
  .add("log_out", logOutItem);
