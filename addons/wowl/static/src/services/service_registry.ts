import { actionManagerService } from "../action_manager/action_manager";
import { Registry } from "../core/registry";
import { crashManagerService } from "../crash_manager/crash_manager_service";
import { notificationService } from "../notifications/notification_service";
import { cookieService } from "./cookie";
import { dialogManagerService } from "./dialog_manager";
import { menusService } from "./menus";
import { modelService } from "./model";
import { routerService } from "./router";
import { rpcService } from "./rpc";
import { titleService } from "./title";
import { uiService } from "./ui/ui";
import { userService } from "./user";
import { viewManagerService } from "./view_manager";
import { Service } from "../types";


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
