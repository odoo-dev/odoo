import { Component, hooks, tags } from "@odoo/owl";
import type {
  ActionContext,
  OdooEnv,
  Service,
  ComponentAction,
  FunctionAction,
  Type,
  View,
  ViewId,
  ViewProps,
  ViewType,
  ControllerProps,
} from "../types";
import { DomainListRepr as Domain } from "../core/domain";

import { Route } from "../services/router";
import { evaluateExpr } from "../py/index";
import { makeContext } from "../core/context";
import { ActionDialog, ActionDialogProps } from "./action_dialog";
import { KeepLast } from "../utils/concurrency";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type ActionType = Action["type"];
type ActionTarget = "current" | "main" | "new" | "fullscreen" | "inline";
type URLActionTarget = "self";
type ActionId = number;
type ActionXMLId = string;
type ActionTag = string;
export type ActionDescription = any;

export type ActionRequest = ActionId | ActionXMLId | ActionTag | ActionDescription;
export interface ActionOptions {
  additionalContext?: { [key: string]: any };
  clearBreadcrumbs?: boolean;
  viewType?: ViewType;
  resId?: number;
  onClose?: CallableFunction;
}

interface Context {
  [key: string]: any;
}

interface ActionCommonInfo {
  id?: number;
  jsId: string;
  display_name?: string;
  name?: string;
  context?: Context;
  type: ActionType;
  _originalAction?: string;
}
export interface ClientAction extends ActionCommonInfo {
  res_model?: string;
  type: "ir.actions.client";
  tag: string;
  target: ActionTarget;
  params?: {
    [key: string]: any;
  };
}
interface ActWindowControllers {
  [key: string]: ViewController;
}
export interface ActWindowAction extends ActionCommonInfo {
  type: "ir.actions.act_window";
  res_model: string;
  views: [ViewId, ViewType][];
  context: Context;
  domain: Domain | false;
  search_view_id?: [ViewId, string]; // second member is the views's display_name, not the type
  target: ActionTarget;
  res_id?: number;
  controllers: ActWindowControllers;
}
interface ServerAction extends ActionCommonInfo {
  type: "ir.actions.server";
  id: number;
}
interface ActURLAction extends ActionCommonInfo {
  type: "ir.actions.act_url";
  target?: URLActionTarget;
  url: string;
}
interface ReportAction extends ActionCommonInfo {
  type: "ir.actions.report";
  close_on_report_download?: boolean;
  data?: any;
  report_file?: string;
  report_name: string;
  report_type: "qweb-html" | "qweb-pdf" | "qweb-text";
}
interface CloseAction extends ActionCommonInfo {
  type: "ir.actions.act_window_close";
}
export type Action =
  | ClientAction
  | CloseAction
  | ActWindowAction
  | ServerAction
  | ActURLAction
  | ReportAction;

type ReportType = "html" | "pdf" | "text";
type WkhtmltopdfState = "ok" | "broken" | "install" | "upgrade" | "workers";

interface Controller {
  jsId: string;
  Component: Type<Component<{}, OdooEnv>>;
  action: ClientAction | ActWindowAction;
  props: ControllerProps;
  exportedState?: any;
  title?: string;
}
interface ViewController extends Controller {
  action: ActWindowAction;
  view: View;
  views: View[];
  props: ViewProps;
}
type ControllerStack = Controller[];

export interface Breadcrumb {
  jsId: string;
  name: string;
}
export type Breadcrumbs = Breadcrumb[];

interface MainActionManagerUpdateInfo {
  id?: number;
  type: "MAIN";
  Component?: Type<Component<{}, OdooEnv>>;
  componentProps?: ControllerProps;
}

interface DialogActionManagerUpdateInfo {
  id?: number;
  type: "OPEN_DIALOG" | "CLOSE_DIALOG";
  props?: ActionDialogProps;
  onClose?: ActionOptions["onClose"];
  onCloseInfo?: any;
}

export type ActionManagerUpdateInfo = MainActionManagerUpdateInfo | DialogActionManagerUpdateInfo;

interface UpdateStackOptions {
  clearBreadcrumbs?: boolean;
  index?: number;
  lazyController?: Controller;
  onClose?: ActionOptions["onClose"];
}

interface ViewOptions {
  recordId?: number;
  recordIds?: number[];
  searchModel?: string;
  searchPanel?: string;
}

interface ActionCache {
  [key: string]: Promise<Partial<Action>>;
}

interface DoActionButtonParams {
  args?: string;
  buttonContext?: string;
  close?: boolean;
  context: Context;
  effect?: string;
  model: string;
  name: string;
  recordId?: number;
  recordIds: number[];
  special?: boolean;
  type: "object" | "action";
  onClose?: ActionOptions["onClose"];
}

export interface ActionManager {
  doAction(action: ActionRequest, options?: ActionOptions): Promise<void>;
  doActionButton(params: DoActionButtonParams): Promise<void>;
  switchView(viewType: string, options?: ViewOptions): Promise<void>;
  restore(jsId: string): void;
  loadState(state: Route["hash"], options: ActionOptions): Promise<boolean>;
}

export function clearUncommittedChanges(env: OdooEnv): Promise<void[]> {
  const callbacks: ClearUncommittedChanges[] = [];
  env.bus.trigger("CLEAR-UNCOMMITTED-CHANGES", callbacks);
  return Promise.all(callbacks.map((fn) => fn()));
}

interface useSetupActionParams {
  export?: () => any;
  beforeLeave?: ClearUncommittedChanges;
  getTitle?: () => string;
}

type ClearUncommittedChanges = () => Promise<void>;

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ViewNotFoundError extends Error {
  name = "ViewNotFoundError";
}

// -----------------------------------------------------------------------------
// Action hook
// -----------------------------------------------------------------------------

/**
 * This hooks should be used by Action Components (client actions or views). It
 * allows to implement the 'export' feature which aims at restoring the state
 * of the Component when we come back to it (e.g. using the breadcrumbs).
 */
export function useSetupAction(params: useSetupActionParams) {
  const component: Component = Component.current!;
  if (params.export && component.props.__exportState__) {
    hooks.onWillUnmount(() => {
      component.props.__exportState__(params.export!());
    });
  }
  if (params.beforeLeave && component.props.__beforeLeave__) {
    hooks.onMounted(() => {
      component.props.__beforeLeave__(params.beforeLeave);
    });
  }
  if (params.getTitle && component.props.__getTitle__) {
    hooks.onMounted(() => {
      component.props.__getTitle__(params.getTitle);
    });
  }
}

// -----------------------------------------------------------------------------
// ActionContainer (Component)
// -----------------------------------------------------------------------------

export class ActionContainer extends Component<{}, OdooEnv> {
  static components = { ActionDialog };
  static template = tags.xml`
    <div t-name="wowl.ActionContainer" class="o_action_manager">
      <t t-if="main.Component" t-component="main.Component" t-props="main.componentProps" t-key="main.id"/>
      <ActionDialog t-if="dialog.id" t-props="dialog.props" t-key="dialog.id" t-on-dialog-closed="_onDialogClosed"/>
    </div>`;
  main: Partial<MainActionManagerUpdateInfo> = {};
  dialog: Partial<DialogActionManagerUpdateInfo> = {};

  constructor(...args: any[]) {
    super(...args);
    this.env.bus.on("ACTION_MANAGER:UPDATE", this, (info: ActionManagerUpdateInfo) => {
      switch (info.type) {
        case "MAIN":
          this.main = info;
          break;
        case "OPEN_DIALOG": {
          const { onClose } = this.dialog;
          this.dialog = {
            id: info.id,
            props: info.props,
            onClose: onClose || info.onClose,
          };
          break;
        }
        case "CLOSE_DIALOG": {
          let onClose;
          if (this.dialog.id) {
            onClose = this.dialog.onClose;
          } else {
            onClose = info.onClose;
          }
          if (onClose) {
            onClose(info.onCloseInfo);
          }
          this.dialog = {};
          break;
        }
      }
      this.render();
    });
  }

  _onDialogClosed() {
    this.dialog = {};
    this.render();
  }
}

// -----------------------------------------------------------------------------
// ActionManager (Service)
// -----------------------------------------------------------------------------

function makeActionManager(env: OdooEnv): ActionManager {
  const keepLast = new KeepLast();
  let id = 0;
  let controllerStack: ControllerStack = [];
  let dialogCloseProm: Promise<any> | undefined = undefined;
  const actionCache: ActionCache = {};
  // regex that matches context keys not to forward from an action to another
  const CTX_KEY_REGEX = /^(?:(?:default_|search_default_|show_).+|.+_view_ref|group_by|group_by_no_leaf|active_id|active_ids|orderedBy)$/;

  // ---------------------------------------------------------------------------
  // misc
  // ---------------------------------------------------------------------------

  /**
   * Given an id, xmlid, tag (key of the client action registry) or directly an
   * object describing an action.
   *
   * @private
   * @param {ActionRequest} actionRequest
   * @param {Context} [context={}]
   * @returns {Promise<Action>}
   */
  async function _loadAction(
    actionRequest: ActionRequest,
    context: Context = {}
  ): Promise<ActionRequest> {
    let action;
    if (typeof actionRequest === "string" && odoo.actionRegistry.contains(actionRequest)) {
      // actionRequest is a key in the actionRegistry
      return {
        target: "current",
        tag: actionRequest,
        type: "ir.actions.client",
      };
    } else if (typeof actionRequest === "string" || typeof actionRequest === "number") {
      // actionRequest is an id or an xmlid
      const key = JSON.stringify(actionRequest);
      if (!actionCache[key]) {
        actionCache[key] = env.services.rpc("/web/action/load", {
          action_id: actionRequest,
          additional_context: {
            active_id: context.active_id,
            active_ids: context.active_ids,
            active_model: context.active_model,
          },
        });
      }
      action = await keepLast.add(actionCache[key]);
    } else {
      // actionRequest is an object describing the action
      action = actionRequest;
    }
    return action;
  }

  /*this function returns an action description
   * with a unique jsId.
   */
  function _preprocessAction(action: ActionRequest, context: Context = {}): Action {
    const jsId = `action_${++id}`;
    action.context = makeContext(env.services.user.context, context, action.context);
    if (action.domain) {
      const domain = action.domain || [];
      action.domain = typeof domain === "string" ? evaluateExpr(domain, action.context) : domain;
    }

    const originalAction = JSON.stringify(action);
    action = JSON.parse(originalAction); // manipulate a deep copy
    action._originalAction = originalAction;

    action.jsId = jsId;
    if (action.type === "ir.actions.act_window") {
      action.controllers = {};
    }

    if (action.type === "ir.actions.act_window" || action.type === "ir.actions.client") {
      action.target = action.target || "current";
    }
    return action;
  }

  /**
   * Given a controller stack, returns the list of breadcrumb items.
   *
   * @private
   * @param {ControllerStack} stack
   * @returns {Breadcrumbs}
   */
  function _getBreadcrumbs(stack: ControllerStack): Breadcrumbs {
    return stack.map((controller) => {
      return {
        jsId: controller.jsId,
        name: controller.title || controller.action.name || env._t("Undefined"),
      };
    });
  }

  /**
   * @param {BaseView} view
   * @param {ActWindowAction} action
   * @param {BaseView[]} views
   * @returns {ViewProps}
   */
  function _getViewProps(
    view: View,
    action: ActWindowAction,
    views: View[],
    options: ViewOptions = {}
  ): ViewProps {
    const target = action.target;
    const viewSwitcherEntries = views
      .filter((v) => v.multiRecord === view.multiRecord)
      .map((v) => {
        return {
          // FIXME: missing accesskey
          icon: v.icon,
          name: v.display_name,
          type: v.type,
          multiRecord: v.multiRecord, // FIXME: needed for legacy views
        };
      });

    const props: ViewProps = {
      actionId: action.id,
      action: action, // FIXME: needed for legacy views, find another way to give it to them
      context: action.context,
      domain: action.domain || [],
      model: action.res_model,
      type: view.type,
      views: action.views,
      viewSwitcherEntries,
      withActionMenus: target !== "new" && target !== "inline",
      withFilters: action.views.some((v) => v[1] === "search"),
    };
    if (options.recordId || action.res_id) {
      props.recordId = options.recordId || action.res_id;
    }
    if (options.recordIds) {
      props.recordIds = options.recordIds;
    }
    if (options.searchModel) {
      props.searchModel = options.searchModel;
    }
    if (options.searchPanel) {
      props.searchPanel = options.searchPanel;
    }
    if (action.controllers[view.type]) {
      // this controller has already been used, re-import its exported state
      props.state = action.controllers[view.type].exportedState;
    }
    return props;
  }

  /**
   * Triggers a re-rendering with respect to the given controller.
   *
   * @private
   * @param {Controller} controller
   * @param {UpdateStackOptions} options
   * @param {boolean} [options.clearBreadcrumbs=false]
   * @param {number} [options.index]
   */
  async function _updateUI(
    controller: Controller,
    options: UpdateStackOptions = {}
  ): Promise<void> {
    let resolve: (v?: any) => any;
    let reject: (v?: any) => any;
    let dialogCloseResolve: (v?: any) => any;
    const currentActionProm: Promise<void> = new Promise((_res, _rej) => {
      resolve = _res;
      reject = _rej;
    });
    const action = controller.action;

    class ControllerComponent extends Component<{}, OdooEnv> {
      static template = tags.xml`<t t-component="Component" t-props="props"
        __exportState__="exportState"
        __beforeLeave__="beforeLeave"
        __getTitle__="getTitle"
          t-ref="component"
          t-on-history-back="onHistoryBack"/>`;

      static Component = controller.Component;
      Component = controller.Component;
      componentProps = this.props;
      componentRef = hooks.useRef("component");
      exportState: ((state: any) => void) | null = null;
      beforeLeave: ((callback: ClearUncommittedChanges) => void) | null = null;
      getTitle: ((title: () => string) => void) | null = null;

      constructor() {
        super(...arguments);
        if (action.target !== "new") {
          this.exportState = (state) => {
            controller.exportedState = state;
          };
          const beforeLeaveFns: ClearUncommittedChanges[] = [];
          this.beforeLeave = (callback) => {
            beforeLeaveFns.push(callback);
          };
          this.getTitle = (getTitle) => {
            if (!("title" in controller)) {
              Object.defineProperty(controller, "title", {
                get: getTitle,
              });
            }
          };
          this.env.bus.on("CLEAR-UNCOMMITTED-CHANGES", this, (callbacks) => {
            beforeLeaveFns.forEach((fn) => callbacks.push(fn));
          });
        }
      }
      catchError(error: any) {
        // The above component should truely handle the error
        reject(error);
      }
      mounted() {
        let mode: "new" | "current" | "fullscreen";
        if (action.target !== "new") {
          // LEGACY CODE COMPATIBILITY: remove when controllers will be written in owl
          // we determine here which actions no longer occur in the nextStack,
          // and we manually destroy all their controller's widgets
          const nextStackActionIds = nextStack.map((c) => c.action.jsId);
          const toDestroy: Set<Controller> = new Set();
          for (const c of controllerStack) {
            if (!nextStackActionIds.includes(c.action.jsId)) {
              if (c.action.type === "ir.actions.act_window") {
                for (const viewType in (c.action as any).controllers) {
                  toDestroy.add(c.action.controllers[viewType]);
                }
              } else {
                toDestroy.add(c);
              }
            }
          }
          for (const c of toDestroy) {
            if (c.exportedState) {
              c.exportedState.__legacy_widget__.destroy();
            }
          }
          // END LEGACY CODE COMPATIBILITY

          controllerStack = nextStack; // the controller is mounted, commit the new stack
          // wait Promise callbacks to be executed
          pushState(controller);
          mode = "current";
          if (controllerStack.some((c) => c.action.target === "fullscreen")) {
            mode = "fullscreen";
          }
          odoo.browser.sessionStorage.setItem("current_action", action._originalAction!);
        } else {
          dialogCloseProm = new Promise((_r: any) => {
            dialogCloseResolve = _r;
          }).then(() => {
            dialogCloseProm = undefined;
          });
          mode = "new";
        }
        resolve();
        env.bus.trigger("ACTION_MANAGER:UI-UPDATED", mode);
      }
      willUnmount() {
        if (action.target === "new" && dialogCloseResolve) {
          dialogCloseResolve();
        }
        this.env.bus.off("CLEAR-UNCOMMITTED-CHANGES", this);
      }
      onHistoryBack() {
        const previousController = controllerStack[controllerStack.length - 2];
        if (previousController && !dialogCloseProm) {
          restore(previousController.jsId);
        } else {
          _executeCloseAction();
        }
      }
    }
    if (action.target === "new") {
      const actionDialogProps: Partial<ActionDialogProps> = {
        // TODO add size
        ActionComponent: ControllerComponent,
        actionProps: controller.props,
      };
      if (action.name) {
        actionDialogProps.title = action.name;
      }
      env.bus.trigger("ACTION_MANAGER:UPDATE", {
        type: "OPEN_DIALOG",
        id: ++id,
        props: actionDialogProps,
        onClose: options.onClose,
      });
      return currentActionProm;
    }

    let index = null;
    if (options.clearBreadcrumbs) {
      index = 0;
    } else if ("index" in options) {
      index = options.index;
    } else {
      index = controllerStack.length + 1;
    }
    const controllerArray: typeof controllerStack = [controller];
    if (options.lazyController) {
      controllerArray.unshift(options.lazyController);
    }
    const nextStack = controllerStack.slice(0, index).concat(controllerArray);
    controller.props.breadcrumbs = _getBreadcrumbs(nextStack.slice(0, nextStack.length - 1));

    const closingProm = _executeCloseAction();
    env.bus.trigger("ACTION_MANAGER:UPDATE", {
      type: "MAIN",
      id: ++id,
      Component: ControllerComponent,
      componentProps: controller.props,
    });
    return Promise.all([currentActionProm, closingProm]).then((r) => r[0]);
  }

  // ---------------------------------------------------------------------------
  // ir.actions.act_url
  // ---------------------------------------------------------------------------

  /**
   * Executes actions of type 'ir.actions.act_url', i.e. redirects to the
   * given url.
   *
   * @private
   * @param {ActURLAction} action
   */
  function _executeActURLAction(action: ActURLAction): void {
    if (action.target === "self") {
      env.services.router.redirect(action.url);
    } else {
      const w = odoo.browser.open(action.url, "_blank");
      if (!w || w.closed || typeof w.closed === "undefined") {
        const msg = env._t(
          "A popup window has been blocked. You may need to change your " +
            "browser settings to allow popup windows for this page."
        );
        env.services.notifications.create(msg, {
          sticky: true,
          type: "warning",
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // ir.actions.act_window
  // ---------------------------------------------------------------------------

  /**
   * Executes an action of type 'ir.actions.act_window'.
   *
   * @private
   * @param {ActWindowAction} action
   * @param {ActionOptions} options
   */
  function _executeActWindowAction(action: ActWindowAction, options: ActionOptions): Promise<void> {
    const views: View[] = [];
    for (const [, type] of action.views) {
      if (odoo.viewRegistry.contains(type)) {
        views.push(odoo.viewRegistry.get(type));
      }
    }
    if (!views.length) {
      throw new Error(`No view found for act_window action ${action.id}`);
    }

    const target = action.target;
    if (target !== "inline" && !(target === "new" && action.views[0][1] === "form")) {
      // FIXME: search view arch is already sent with load_action, so either remove it
      // from there or load all fieldviews alongside the action for the sake of consistency
      const searchViewId = action.search_view_id ? action.search_view_id[0] : false;
      action.views.push([searchViewId, "search"]);
    }
    let view = options.viewType && views.find((v) => v.type === options.viewType);
    let lazyController: ViewController | undefined;
    if (view && !view.multiRecord) {
      const lazyView = views[0].multiRecord ? views[0] : undefined;
      if (lazyView) {
        lazyController = {
          jsId: `controller_${++id}`,
          Component: lazyView,
          action,
          view: lazyView,
          views,
          props: _getViewProps(lazyView, action, views),
        };
      }
    } else if (!view) {
      view = views[0];
    }
    const viewOptions: ViewOptions = {};
    if (options.resId) {
      viewOptions.recordId = options.resId;
    }

    const controller: ViewController = {
      jsId: `controller_${++id}`,
      Component: view,
      action,
      view,
      views,
      props: _getViewProps(view, action, views, viewOptions),
    };
    action.controllers[view.type] = controller;
    return _updateUI(controller, {
      clearBreadcrumbs: options.clearBreadcrumbs,
      lazyController,
      onClose: options.onClose,
    });
  }

  // ---------------------------------------------------------------------------
  // ir.actions.client
  // ---------------------------------------------------------------------------

  /**
   * Executes an action of type 'ir.actions.client'.
   *
   * @private
   * @param {ClientAction} action
   * @param {ActionOptions} options
   */
  async function _executeClientAction(action: ClientAction, options: ActionOptions): Promise<void> {
    const clientAction = odoo.actionRegistry.get(action.tag);
    if (clientAction.prototype instanceof Component) {
      const controller: Controller = {
        jsId: `controller_${++id}`,
        Component: clientAction as ComponentAction,
        action,
        props: {
          action, // FIXME
          params: action.params,
        },
      };
      return _updateUI(controller, {
        clearBreadcrumbs: options.clearBreadcrumbs,
        onClose: options.onClose,
      });
    } else {
      return (clientAction as FunctionAction)(env, action);
    }
  }

  // ---------------------------------------------------------------------------
  // ir.actions.report
  // ---------------------------------------------------------------------------

  // messages that might be shown to the user dependening on the state of wkhtmltopdf
  const link = '<br><br><a href="http://wkhtmltopdf.org/" target="_blank">wkhtmltopdf.org</a>';
  const WKHTMLTOPDF_MESSAGES: { [key: string]: string } = {
    broken:
      env._t(
        "Your installation of Wkhtmltopdf seems to be broken. The report will be shown " +
          "in html."
      ) + link,
    install:
      env._t("Unable to find Wkhtmltopdf on this system. The report will be shown in " + "html.") +
      link,
    upgrade:
      env._t(
        "You should upgrade your version of Wkhtmltopdf to at least 0.12.0 in order to " +
          "get a correct display of headers and footers as well as support for " +
          "table-breaking between pages."
      ) + link,
    workers: env._t(
      "You need to start Odoo with at least two workers to print a pdf version of " + "the reports."
    ),
  };
  // only check the wkhtmltopdf state once, so keep the rpc promise
  let wkhtmltopdfStateProm: Promise<WkhtmltopdfState>;

  /**
   * Generates the report url given a report action.
   *
   * @private
   * @param {ReportAction} action
   * @param {ReportType} type
   * @returns {string}
   */
  function _getReportUrl(action: ReportAction, type: ReportType): string {
    let url = `/report/${type}/${action.report_name}`;
    const actionContext = action.context || {};
    if (action.data && JSON.stringify(action.data) !== "{}") {
      // build a query string with `action.data` (it's the place where reports
      // using a wizard to customize the output traditionally put their options)
      const options = encodeURIComponent(JSON.stringify(action.data));
      const context = encodeURIComponent(JSON.stringify(actionContext));
      url += `?options=${options}&context=${context}`;
    } else if (actionContext.active_ids) {
      url += `/${actionContext.active_ids.join(",")}`;
    }
    return url;
  }

  /**
   * Launches download action of the report
   *
   * @private
   * @param {ReportAction} action
   * @param {ActionOptions} options
   * @returns {Promise}
   */
  async function _triggerDownload(
    action: ReportAction,
    options: ActionOptions,
    type: ReportType
  ): Promise<void> {
    const url = _getReportUrl(action, type);
    env.services.ui.block();
    try {
      await env.services.download({
        url: "/report/download",
        data: {
          data: JSON.stringify([url, action.report_type]),
          context: JSON.stringify(env.services.user.context),
        },
      });
    } finally {
      env.services.ui.unblock();
    }
    if (action.close_on_report_download) {
      return doAction({ type: "ir.actions.act_window_close" });
    }
  }

  function _executeReportClientAction(action: ReportAction, options: ActionOptions): Promise<void> {
    const clientActionOptions = Object.assign({}, options, {
      context: action.context,
      data: action.data,
      display_name: action.display_name,
      name: action.name,
      report_file: action.report_file,
      report_name: action.report_name,
      report_url: _getReportUrl(action, "html"),
    });
    return doAction("report.client_action", clientActionOptions);
  }

  /**
   * Executes actions of type 'ir.actions.report'.
   *
   * @private
   * @param {ReportAction} action
   * @param {ActionOptions} options
   */
  async function _executeReportAction(action: ReportAction, options: ActionOptions): Promise<void> {
    if (action.report_type === "qweb-html") {
      return _executeReportClientAction(action, options);
    } else if (action.report_type === "qweb-pdf") {
      // check the state of wkhtmltopdf before proceeding
      if (!wkhtmltopdfStateProm) {
        wkhtmltopdfStateProm = env.services.rpc("/report/check_wkhtmltopdf");
      }
      const state = await wkhtmltopdfStateProm;
      // display a notification according to wkhtmltopdf's state
      if (state in WKHTMLTOPDF_MESSAGES) {
        env.services.notifications.create(WKHTMLTOPDF_MESSAGES[state], {
          sticky: true,
          title: env._t("Report"),
        });
      }

      if (state === "upgrade" || state === "ok") {
        // trigger the download of the PDF report
        return _triggerDownload(action, options, "pdf");
      } else {
        // open the report in the client action if generating the PDF is not possible
        return _executeReportClientAction(action, options);
      }
    } else if (action.report_type === "qweb-text") {
      return _triggerDownload(action, options, "text");
    } else {
      console.error(`The ActionManager can't handle reports of type ${action.report_type}`, action);
    }
  }

  // ---------------------------------------------------------------------------
  // ir.actions.server
  // ---------------------------------------------------------------------------

  /**
   * Executes an action of type 'ir.actions.server'.
   *
   * @private
   * @param {ServerAction} action
   * @param {ActionOptions} options
   * @returns {Promise<void>}
   */
  async function _executeServerAction(action: ServerAction, options: ActionOptions): Promise<void> {
    const runProm = env.services.rpc("/web/action/run", {
      action_id: action.id,
      context: action.context || {},
    });
    let nextAction = await keepLast.add(runProm);
    nextAction = nextAction || { type: "ir.actions.act_window_close" };
    return doAction(nextAction, options);
  }

  function _executeCloseAction(
    params: { onClose?: ActionOptions["onClose"]; onCloseInfo?: any } = {}
  ) {
    env.bus.trigger("ACTION_MANAGER:UPDATE", {
      type: "CLOSE_DIALOG",
      ...params,
    });
    return dialogCloseProm;
  }

  // ---------------------------------------------------------------------------
  // public API
  // ---------------------------------------------------------------------------

  /**
   * Main entry point of a 'doAction' request. Loads the action and executes it.
   *
   * @param {ActionRequest} actionRequest
   * @param {ActionOptions} options
   * @returns {Promise<void>}
   */
  async function doAction(
    actionRequest: ActionRequest,
    options: ActionOptions = {}
  ): Promise<void> {
    let action = await _loadAction(actionRequest, options.additionalContext);
    action = _preprocessAction(action, options.additionalContext);
    switch (action.type) {
      case "ir.actions.act_url":
        return _executeActURLAction(action);
      case "ir.actions.act_window":
        if (action.target !== "new") {
          await clearUncommittedChanges(env);
        }
        return _executeActWindowAction(action, options);
      case "ir.actions.act_window_close":
        return _executeCloseAction({ onClose: options.onClose, onCloseInfo: action.infos });
      case "ir.actions.client":
        if (action.target !== "new") {
          await clearUncommittedChanges(env);
        }
        return _executeClientAction(action, options);
      case "ir.actions.report":
        return _executeReportAction(action, options);
      case "ir.actions.server":
        return _executeServerAction(action, options);
      default:
        throw new Error(
          `The ActionManager service can't handle actions of type ${(action as any).type}`
        );
    }
  }

  /**
   * Executes an action on top of the current one (typically, when a button in a
   * view is clicked). The button may be of type 'object' (call a given method
   * of a given model) or 'action' (execute a given action). Alternatively, the
   * button may have the attribute 'special', and in this case an
   * 'ir.actions.act_window_close' is executed.
   *
   * @param {DoActionButtonParams} params
   * @returns {Promise<void>}
   */
  async function doActionButton(params: DoActionButtonParams) {
    // determine the action to execute according to the params
    let action: ActionDescription;
    const context = makeContext(params.context, params.buttonContext);
    if (params.special) {
      action = { type: "ir.actions.act_window_close" }; // FIXME: infos: { special : true } ?
    } else if (params.type === "object") {
      // call a Python Object method, which may return an action to execute
      let args = params.recordId ? [[params.recordId]] : [params.recordIds];
      if (params.args) {
        let additionalArgs;
        try {
          // warning: quotes and double quotes problem due to json and xml clash
          // maybe we should force escaping in xml or do a better parse of the args array
          additionalArgs = JSON.parse(params.args.replace(/'/g, '"'));
        } catch (e) {
          odoo.browser.console.error("Could not JSON.parse arguments", params.args);
        }
        args = args.concat(additionalArgs);
      }
      const callProm = env.services.rpc("/web/dataset/call_button", {
        args,
        kwargs: { context },
        method: params.name,
        model: params.model,
      });
      action = await keepLast.add(callProm);
      action = action || { type: "ir.actions.act_window_close" };
    } else if (params.type === "action") {
      // execute a given action, so load it first
      context.active_id = params.recordId || null;
      context.active_ids = params.recordIds;
      context.active_model = params.model;
      action = await _loadAction(params.name, context);
    }

    // filter out context keys that are specific to the current action, because:
    //  - wrong default_* and search_default_* values won't give the expected result
    //  - wrong group_by values will fail and forbid rendering of the destination view
    let currentCtx: Context = {};
    for (const key in params.context) {
      if (key.match(CTX_KEY_REGEX) === null) {
        currentCtx[key] = params.context[key];
      }
    }
    const activeCtx: Context = { active_model: params.model };
    if (params.recordId) {
      activeCtx.active_id = params.recordId;
      activeCtx.active_ids = [params.recordId];
    }
    action.context = makeContext(currentCtx, params.buttonContext, activeCtx, action.context);

    // in case an effect is returned from python and there is already an effect
    // attribute on the button, the priority is given to the button attribute
    action.effect = params.effect ? evaluateExpr(params.effect) : action.effect;

    const options = { onClose: params.onClose };
    await doAction(action, options);

    if (params.close) {
      _executeCloseAction();
    }
  }

  /**
   * Switches to the given view type in action of the last controller of the
   * stack. This action must be of type 'ir.actions.act_window'.
   *
   * @param {ViewType} viewType
   */
  async function switchView(viewType: ViewType, options?: ViewOptions): Promise<void> {
    const controller = controllerStack[controllerStack.length - 1] as ViewController;
    if (controller.action.type !== "ir.actions.act_window") {
      throw new Error(`switchView called but the current controller isn't a view`);
    }
    const view = controller.views.find((view: any) => view.type === viewType);
    if (!view) {
      throw new ViewNotFoundError(
        env._t(`No view of type '${viewType}' could be found in the current action.`)
      );
    }
    const newController = controller.action.controllers[viewType] || {
      jsId: `controller_${++id}`,
      Component: view,
      action: controller.action,
      views: controller.views,
      view,
    };
    newController.props = _getViewProps(view, controller.action, controller.views, options);
    controller.action.controllers[viewType] = newController;
    let index;
    if (view.multiRecord) {
      index = controllerStack.findIndex((ct) => ct.action.jsId === controller.action.jsId);
      index = index > -1 ? index : controllerStack.length - 1;
    } else {
      // This case would mostly happen when one changes the view_type in the URL
      // via loadState. Also, I guess we may need it when we have other monoRecord views
      index = controllerStack.findIndex(
        (ct) =>
          ct.action.jsId === controller.action.jsId && !(ct as ViewController).view.multiRecord
      );
      index = index > -1 ? index : controllerStack.length;
    }
    await clearUncommittedChanges(env);
    return _updateUI(newController, { index });
  }

  /**
   * Restores a controller from the controller stack given its id. Typically,
   * this function is called when clicking on the breadcrumbs.
   *
   * @param {string} jsId
   */
  async function restore(jsId: string): Promise<void> {
    const index = controllerStack.findIndex((controller) => controller.jsId === jsId);
    if (index < 0) {
      throw new Error("invalid controller to restore");
    }
    const controller = controllerStack[index];
    if (controller.action.type === "ir.actions.act_window") {
      controller.props = _getViewProps(
        (controller as ViewController).view,
        controller.action,
        (controller as ViewController).views
      );
    } else if (controller.exportedState) {
      controller.props.state = controller.exportedState;
    }
    await clearUncommittedChanges(env);
    return _updateUI(controller, { index });
  }

  async function loadState(state: Route["hash"], options: ActionOptions): Promise<boolean> {
    let action: ActionRequest | undefined;
    if (state.action) {
      // ClientAction
      if (odoo.actionRegistry.contains(state.action)) {
        action = {
          params: state,
          tag: state.action,
          type: "ir.actions.client",
        };
      }
      const currentController = controllerStack[controllerStack.length - 1];
      const currentActionId =
        currentController && currentController.action && currentController.action.id;
      // Window Action: determine model, viewType etc....
      if (
        !action &&
        currentController &&
        currentController.action.type === "ir.actions.act_window" &&
        currentActionId === parseInt(state.action, 10)
      ) {
        // only when we already have an action in dom
        try {
          const viewOptions: ViewOptions = {};
          if (state.id) {
            viewOptions.recordId = parseInt(state.id, 10);
          }
          let viewType = state.view_type || (currentController as ViewController).view.type;
          await switchView(viewType, viewOptions);
          return true;
        } catch (e) {
          if (e instanceof ViewNotFoundError) {
            return false;
          }
          throw e;
        }
      }
      if (!action) {
        // the action to load isn't the current one, so execute it
        const context: ActionContext = {};
        if (state.active_id) {
          context.active_id = state.active_id;
        }
        if (state.active_ids) {
          // jQuery's BBQ plugin does some parsing on values that are valid integers
          // which means that if there's only one item, it will do parseInt() on it,
          // otherwise it will keep the comma seperated list as string
          context.active_ids = state.active_ids.split(",").map(function (id: string) {
            return parseInt(id, 10) || id;
          });
        } else if (state.active_id) {
          context.active_ids = [state.active_id];
        }
        context.params = state;
        action = state.action;
        options = Object.assign(options, {
          additionalContext: context,
          resId: state.id ? parseInt(state.id, 10) : undefined, // empty string from router state
          viewType: state.view_type,
        });
      }
    } else if (state.model && (state.view_type || state.id)) {
      if (state.id) {
        action = {
          res_model: state.model,
          res_id: parseInt(state.id, 10),
          type: "ir.actions.act_window",
          views: [[state.view_id ? parseInt(state.view_id, 10) : false, "form"]],
        };
      } else if (state.view_type) {
        // this is a window action on a multi-record view, so restore it
        // from the session storage
        const storedAction = odoo.browser.sessionStorage.getItem("current_action");
        const lastAction = JSON.parse(storedAction || "{}");
        if (lastAction.res_model === state.model) {
          action = lastAction;
          options.viewType = state.view_type;
        }
      }
    }
    if (action) {
      await doAction(action, options);
      return true;
    }
    return false;
  }

  function pushState(controller: Controller) {
    const newState: Route["hash"] = {};
    const action = controller.action;
    if (action.id) {
      newState.action = `${action.id}`;
    } else if ((action as any).tag) {
      newState.action = (action as any).tag;
    }
    const actionProps = controller.props;
    if ("model" in actionProps) {
      // type === ViewProps
      newState.model = actionProps.model;
      newState.view_type = actionProps.type;
      newState.id = actionProps.recordId ? `${actionProps.recordId}` : undefined;
    }
    env.services.router.pushState(newState, true);
  }

  return {
    doAction,
    doActionButton,
    switchView,
    restore,
    loadState,
  };
}

export const actionManagerService: Service<ActionManager> = {
  name: "action_manager",
  dependencies: ["notifications", "rpc", "user", "router"],
  deploy(env: OdooEnv): ActionManager {
    return makeActionManager(env);
  },
};
