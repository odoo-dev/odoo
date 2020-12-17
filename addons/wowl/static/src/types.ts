import type { Component } from "@odoo/owl";
import { Env } from "@odoo/owl/dist/types/component/component";
import { EventBus } from "@odoo/owl/dist/types/core/event_bus";
// add here each service type to have better typing for useService
import type { actionManagerService } from "./action_manager/action_manager";
import { Breadcrumb } from "./action_manager/action_manager";
import { actionRegistry } from "./action_manager/action_registry";
import { debugManagerRegistry } from "./debug_manager/debug_manager_registry";
import { Context } from "./core/context";
import { DomainListRepr as Domain } from "./core/domain";
import { Localization } from "./core/localization";
import { errorDialogRegistry } from "./crash_manager/error_dialog_registry";
import type { notificationService } from "./notifications/notification_service";
import type { cookieService } from "./services/cookie";
import type { dialogManagerService } from "./services/dialog_manager";
import type { menusService } from "./services/menus";
import type { modelService } from "./services/model";
import type { routerService } from "./services/router";
import type { rpcService } from "./services/rpc";
import { serviceRegistry } from "./services/service_registry";
import type { titleService } from "./services/title";
import type { uiService } from "./services/ui/ui";
import type { userService } from "./services/user";
import type { viewManagerService } from "./services/view_manager";
import { viewRegistry } from "./views/view_registry";
import { mainComponentRegistry } from "./webclient/main_component_registry";
import type { systrayRegistry } from "./webclient/systray_registry";
import { userMenuRegistry } from "./webclient/user_menu_registry";
import { debugManagerService } from "./debug_manager/debug_manager_service";

export interface Registries {
  mainComponentRegistry: typeof mainComponentRegistry;
  serviceRegistry: typeof serviceRegistry;
  actionRegistry: typeof actionRegistry;
  viewRegistry: typeof viewRegistry;
  systrayRegistry: typeof systrayRegistry;
  errorDialogRegistry: typeof errorDialogRegistry;
  userMenuRegistry: typeof userMenuRegistry;
  debugManagerRegistry: typeof debugManagerRegistry;
}

interface CacheHashes {
  load_menus: string;
  translations: string;
}

interface UserContext {
  lang: string;
  tz: string;
  uid: number;
}
export interface ActionContext {
  [key: string]: any;
}

export type UserCompany = [number, string];

interface UserCompanies {
  allowed_companies: UserCompany[];
  current_company: UserCompany;
}

export interface SessionInfo {
  cache_hashes: CacheHashes;
  user_context: UserContext;
  qweb: string;
  uid: number;
  name: string;
  username: string;
  is_admin: boolean;
  partner_id: number;
  user_companies: UserCompanies;
  db: string;
  server_version: string;
  server_version_info: (number | string)[];
  home_action_id?: number | false;
  show_effect: boolean;
}

export interface Odoo extends Registries {
  browser: OdooBrowser;
  session_info: SessionInfo;
  csrf_token?: string;
  debug?: string;
  __WOWL_DEBUG__: Debug;
  info: DBInfo;
}

interface DBInfo {
  db: string;
  server_version: string;
  server_version_info: (number | string)[];
}

interface Debug {
  root: Component;
}

export interface Type<T> extends Function {
  new (...args: any[]): T;
}

export interface Service<T = any> {
  name: string;
  dependencies?: string[];
  deploy: (env: OdooEnv, config: OdooConfig) => Promise<T> | T;
}

type Browser = Env["browser"];

export interface OdooBrowser extends Browser {
  console: typeof window["console"];
  location: typeof window["location"];
  navigator: typeof navigator;
  open: typeof window["open"];
  XMLHttpRequest: typeof window["XMLHttpRequest"];
  sessionStorage: typeof window["sessionStorage"];
}

export interface OdooEnv extends Env {
  services: Services;
  bus: EventBus;
  debug: string;
  _t: (str: string) => string;
  isSmall?: boolean;
}

export type ComponentAction = Type<Component<{}, OdooEnv>>;
export type FunctionAction = (env: OdooEnv, action: any) => any;

export interface OdooConfig {
  localization: Localization;
  debug: string;
  templates: string;
  _t: (str: string) => string;
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
type Unwrap<T> = T extends Promise<infer U> ? U : T;
type Nullify<T> = T extends void ? null : T;
type ServiceType<T extends (...args: any[]) => any> = Nullify<Unwrap<ReturnType<T>>>;

export interface Services {
  action_manager: ServiceType<typeof actionManagerService["deploy"]>;
  cookie: ServiceType<typeof cookieService["deploy"]>;
  dialog_manager: ServiceType<typeof dialogManagerService["deploy"]>;
  menus: ServiceType<typeof menusService["deploy"]>;
  model: ServiceType<typeof modelService["deploy"]>;
  notifications: ServiceType<typeof notificationService["deploy"]>;
  rpc: ServiceType<typeof rpcService["deploy"]>;
  router: ServiceType<typeof routerService["deploy"]>;
  title: ServiceType<typeof titleService["deploy"]>;
  ui: ServiceType<typeof uiService["deploy"]>;
  user: ServiceType<typeof userService["deploy"]>;
  view_manager: ServiceType<typeof viewManagerService["deploy"]>;
  debug_manager: ServiceType<typeof debugManagerService["deploy"]>;

  [key: string]: any;
}

export type ViewId = number | false;
export type ViewType =
  | "list"
  | "form"
  | "kanban"
  | "calendar"
  | "pivot"
  | "graph"
  | "activity"
  | "grid"
  | string;

export interface ActionProps {
  action?: any;
  actionId?: number;
  breadcrumbs?: Breadcrumb[];
  state?: any;
}

interface ViewSwitcherEntry {
  name: string;
  icon: string;
  type: string;
}
export type ViewSwitcherEntries = ViewSwitcherEntry[];

export interface ViewProps extends ActionProps {
  context: Context;
  domain?: Domain;
  isLegacy?: true;
  model: string;
  type: ViewType;
  views: [ViewId, ViewType][];
  recordId?: number;
  recordIds?: number[];
  searchModel?: string;
  searchPanel?: string;
  viewSwitcherEntries?: ViewSwitcherEntries;
  withActionMenus?: boolean;
  withFilters?: boolean;

  noContentHelp?: string;
}

export interface ClientActionProps extends ActionProps {
  options?: { [key: string]: any };
}

export type ControllerProps = ActionProps | ViewProps | ClientActionProps;

interface ViewInfo {
  display_name: string;
  icon: string;
  multiRecord: boolean;
  type: ViewType;
}

export type View = Type<Component<ViewProps, OdooEnv>> & ViewInfo;

// -----------------------------------------------------------------------------
// Menu Element
// -----------------------------------------------------------------------------

export type Callback = () => void | Promise<any>;

export interface MenuItem {
  type: "item";
  description: string;
  hide?: boolean;
  href?: string;
  callback?: Callback;
  sequence?: number;
}

export interface MenuItemEventPayload {
  payload: {
    callback: Callback;
  };
}

export interface MenuSeparator {
  type: "separator";
  hide?: boolean;
  sequence: number;
}

export type MenuElement = MenuItem | MenuSeparator;
export type MenuElementFactory<T extends MenuElement = MenuElement> = (env: OdooEnv) => T;
