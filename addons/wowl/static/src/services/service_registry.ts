import { actionManagerService } from "../action_manager/action_manager";
import { Registry } from "../core/registry";
import { crashManagerService } from "../crash_manager/crash_manager_service";
import { notificationService } from "../notifications/notification_service";
import { cookieService } from "./cookie";
import { deviceService } from "./device";
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
import { debugManagerService } from "../debug_manager/debug_manager_service";
import { downloadService } from "./download";
import { effectService } from '../effects/effects_service';

export const serviceRegistry: Registry<Service<any>> = new Registry();

const services = [
  actionManagerService,
  crashManagerService,
  cookieService,
  deviceService,
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
  debugManagerService,
  downloadService,
  effectService,
];

for (let service of services) {
  serviceRegistry.add(service.name, service);
}
