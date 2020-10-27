import { Component, tags } from "@odoo/owl";
import { Dialog } from "../../components/dialog/dialog";
import type {
  OdooEnv,
  Service,
  ComponentAction,
  FunctionAction,
  Type,
  View,
  ViewId,
  ActionProps,
  ViewProps,
  ViewType,
  Domain,
} from "../../types";
import { Route } from "../router";
import { ActionContext, ClientActionProps, ControllerProps } from "../../types";
import { evaluateExpr } from "../../core/py/index";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type ActionType = Action["type"];
type ActionTarget = "current" | "main" | "new" | "fullscreen" | "inline";
type URLActionTarget = "self";
type ActionId = number;
type ActionXMLId = string;
type ActionTag = string;
export type ActionDescription = any;

export type ActionRequest = ActionId | ActionXMLId | ActionTag | ActionDescription;
export interface ActionOptions {
  clearBreadcrumbs?: boolean;
  viewType?: ViewType;
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
}
interface ClientAction extends ActionCommonInfo {
  type: "ir.actions.client";
  tag: string;
  target: ActionTarget;
  params?: {
    [key: string]: any;
  };
}
interface ActWindowAction extends ActionCommonInfo {
  type: "ir.actions.act_window";
  res_model: string;
  views: [ViewId, ViewType][];
  context: Context;
  domain: Domain;
  search_view_id?: [ViewId, string]; // second member is the views's display_name, not the type
  target: ActionTarget;
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
  props: ActionProps | ViewProps | ClientActionProps;
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

interface ActionMangerUpdateInfo {
  type: "MAIN" | "OPEN_DIALOG" | "CLOSE_DIALOG";
  id?: number;
  Component?: Type<Component<{}, OdooEnv>>;
  props?: Controller;
}

interface UpdateStackOptions {
  clearBreadcrumbs?: boolean;
  index?: number;
}

interface ViewOptions {
  recordId?: number;
  recordIds?: number[];
}

interface ActionCache {
  [key: string]: Promise<Partial<Action>>;
}

interface ActionManager {
  doAction(action: ActionRequest, options?: ActionOptions): Promise<void>;
  switchView(viewType: string, options?: ViewOptions): void;
  restore(jsId: string): void;
  loadState(state: Route["hash"], options: ActionOptions): Promise<boolean>;
}

// -----------------------------------------------------------------------------
// ActionContainer (Component)
// -----------------------------------------------------------------------------

export class ActionContainer extends Component<{}, OdooEnv> {
  static template = tags.xml`
    <div t-name="wowl.ActionContainer">
      <t t-if="main.Component" t-component="main.Component" t-props="main.props" t-key="main.id"/>
      <Dialog t-if="dialog.Component" t-key="dialog.id" t-on-dialog-closed="_onDialogClosed">
        <t t-component="dialog.Component" t-props="dialog.props"/>
      </Dialog>
    </div>`;
  static components = { Dialog };
  main: Partial<ActionMangerUpdateInfo> = {};
  dialog: Partial<ActionMangerUpdateInfo> = {};

  constructor(...args: any[]) {
    super(...args);
    this.env.bus.on("ACTION_MANAGER:UPDATE", this, (info: ActionMangerUpdateInfo) => {
      switch (info.type) {
        case "MAIN":
          this.main = { id: info.id, Component: info.Component, props: info.props };
          this.dialog = {};
          break;
        case "OPEN_DIALOG":
          this.dialog = { id: info.id, Component: info.Component, props: info.props };
          break;
        case "CLOSE_DIALOG":
          this.dialog = {};
          break;
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
  let id = 0;
  let controllerStack: ControllerStack = [];
  let dialogCloseProm: Promise<any> | undefined = undefined;
  const actionCache: ActionCache = {};

  // ---------------------------------------------------------------------------
  // misc
  // ---------------------------------------------------------------------------

  /**
   * Given an id, xmlid, tag (key of the client action registry) or directly an
   * object describing an action, this function returns an action description
   * with a unique jsId.
   *
   * @private
   * @param {ActionRequest} actionRequest
   * @param {ActionOptions} options
   * @returns {Promise<Action>}
   */
  async function _loadAction(
    actionRequest: ActionRequest,
    options: ActionOptions
  ): Promise<Action> {
    let action;
    const jsId = `action_${++id}`;
    if (typeof actionRequest === "string" && env.registries.actions.contains(actionRequest)) {
      // actionRequest is a key in the actionRegistry
      return {
        jsId,
        target: "current",
        tag: actionRequest,
        type: "ir.actions.client",
      };
    } else if (typeof actionRequest === "string" || typeof actionRequest === "number") {
      // actionRequest is an id or an xmlid
      const key = JSON.stringify(actionRequest);
      if (!actionCache[key]) {
        actionCache[key] = env.services.rpc("/web/action/load", { action_id: actionRequest });
      }
      action = await actionCache[key];
    } else {
      // actionRequest is an object describing the action
      action = actionRequest;
    }

    action = JSON.parse(JSON.stringify(action)); // manipulate a deep copy
    action.jsId = `action_${++id}`;
    if (action.type === "ir.actions.act_window" || action.type === "ir.actions.client") {
      action.target = action.target || "current";
    }
    if (action.type === "ir.actions.act_window") {
      let context = action.context || {};
      context = typeof context === "string" ? evaluateExpr(context) : context;
      action.context = Object.assign({}, env.services.user.context, context);
      action.domain = evaluateExpr(action.domain || "[]", action.context);
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
        name: controller.action.name || env._t("Undefined"),
      };
    });
  }

  /**
   * @param {View} view
   * @param {ActWindowAction} action
   * @param {View[]} views
   * @returns {ViewProps}
   */
  function _getViewProps(
    view: View,
    action: ActWindowAction,
    views: View[],
    options: ViewOptions = {},
  ): ViewProps {
    const target = action.target;
    const viewSwitcherEntries = views
      .filter((v) => v.multiRecord === view.multiRecord)
      .map((v) => {
        return { icon: v.icon, name: v.name, type: v.type };
      });

    return {
      actionId: action.id,
      context: action.context,
      domain: action.domain,
      model: action.res_model,
      recordId: options.recordId || null,
      recordIds: options.recordIds || null,
      type: view.type,
      views: action.views,
      viewSwitcherEntries,
      withActionMenus: target !== "new" && target !== "inline",
      withFilters: action.views.some((v) => v[1] === "search"),
    };
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
    let resolve: () => any;
    let dialogCloseResolve: () => any;
    const currentActionProm: Promise<void> = new Promise((_r) => {
      resolve = _r;
    });
    const action = controller.action;
    class Controller extends Component {
      static template = tags.xml`<t t-component="Component" t-props="props"/>`;
      Component = controller.Component;
      componentProps = this.props;
      mounted() {
        let updatedMode;
        if (action.target !== "new") {
          updatedMode = "main";
          controllerStack = nextStack; // the controller is mounted, commit the new stack
        } else {
          updatedMode = "dialog";
          dialogCloseProm = new Promise((_r) => {
            dialogCloseResolve = _r;
          }).then(() => {
            dialogCloseProm = undefined;
          });
        }
        resolve();
        env.bus.trigger("ACTION_MANAGER:UI-UPDATED", { updatedMode, action });
      }
      willUnmount() {
        if (action.target === "new" && dialogCloseResolve) {
          dialogCloseResolve();
        }
      }
    }
    if (action.target === "new") {
      env.bus.trigger("ACTION_MANAGER:UPDATE", {
        type: "OPEN_DIALOG",
        id: ++id,
        Component: Controller,
        props: controller.props,
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
    const nextStack = controllerStack.slice(0, index).concat([controller]);
    controller.props.breadcrumbs = _getBreadcrumbs(nextStack);

    env.bus.trigger("ACTION_MANAGER:UPDATE", {
      type: "MAIN",
      id: ++id,
      Component: Controller,
      props: controller.props,
    });
    await currentActionProm;
    pushState(action, controller.props);
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
      // framework.redirect(action.url); // TODO
    } else {
      const w = env.browser.open(action.url, "_blank");
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
    for (const [_, type] of action.views) {
      if (env.registries.views.contains(type)) {
        views.push(env.registries.views.get(type));
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
    // TODO: take the view type present in options.
    // TODO: if view !== multiview, push a multiview before it
    const view = views[0];
    const controller: ViewController = {
      jsId: `controller_${++id}`,
      Component: view.Component,
      action,
      view,
      views,
      props: _getViewProps(view, action, views),
    };
    return _updateUI(controller, { clearBreadcrumbs: options.clearBreadcrumbs });
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
    const clientAction = env.registries.actions.get(action.tag);
    if (clientAction.prototype instanceof Component) {
      const controller: Controller = {
        jsId: `controller_${++id}`,
        Component: clientAction as ComponentAction,
        action,
        props: {
          params: action.params,
        },
      };
      return _updateUI(controller, { clearBreadcrumbs: options.clearBreadcrumbs });
    } else {
      return (clientAction as FunctionAction)();
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
    // TODO: download the report
    console.log(`download report ${url}`);
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
    let nextAction = await env.services.rpc("/web/action/run", {
      action_id: action.id,
      context: action.context || {},
    });
    nextAction = nextAction || { type: "ir.actions.act_window_close" };
    return doAction(nextAction, options);
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
    const action = await _loadAction(actionRequest, options);
    switch (action.type) {
      case "ir.actions.act_url":
        return _executeActURLAction(action);
      case "ir.actions.act_window":
        return _executeActWindowAction(action, options);
      case "ir.actions.act_window_close": {
        env.bus.trigger("ACTION_MANAGER:UPDATE", { type: "CLOSE_DIALOG" });
        return dialogCloseProm;
      }
      case "ir.actions.client":
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
   * Switches to the given view type in action of the last controller of the
   * stack. This action must be of type 'ir.actions.act_window'.
   *
   * @param {ViewType} viewType
   */
  function switchView(viewType: ViewType, options?: ViewOptions): void {
    const controller = controllerStack[controllerStack.length - 1] as ViewController;
    if (controller.action.type !== "ir.actions.act_window") {
      throw new Error(`switchView called but the current controller isn't a view`);
    }
    const view = controller.views.find((view: any) => view.type === viewType);
    if (!view) {
      throw new Error(`switchView: cannot find view of type ${viewType}`);
    }
    const newController = {
      jsId: `controller_${++id}`,
      Component: view.Component,
      action: controller.action,
      views: controller.views,
      view,
      props: _getViewProps(view, controller.action, controller.views, options),
    };
    let index = controllerStack.length;
    if (view.multiRecord) {
      // if the very same action is in stack, replace the multiview controller
      index = controllerStack.findIndex((ct) => ct.action.jsId === controller.action.jsId);
      index = index > -1 ? index : controllerStack.length - 1;
    }
    _updateUI(newController, { index });
  }

  /**
   * Restores a controller from the controller stack given its id. Typically,
   * this function is called when clicking on the breadcrumbs.
   *
   * @param {string} jsId
   */
  function restore(jsId: string): void {
    const index = controllerStack.findIndex((controller) => controller.jsId === jsId);
    if (index < 0) {
      throw new Error("invalid controller to restore");
    }
    _updateUI(controllerStack[index], { index });
  }

  function pushState(action: Action, actionProps: ControllerProps) {
    const newState: Route["hash"] = {};
    if (action.id) {
      newState.action = `${action.id}`;
    }
    if ("model" in actionProps) {
      // type === ViewProps
      newState.model = actionProps.model;
      newState.view_type = actionProps.type;
      newState.id = actionProps.recordId ? `${actionProps.recordId}` : undefined;
    }
    // we should not remove keys in the router that we do not manage.
    // another way to say this is that we must push in new state every
    // single key each time
    env.services.router.pushState(newState);
  }

  async function loadState(state: Route["hash"], options: ActionOptions): Promise<boolean> {
    let action: ActionRequest | undefined;
    if (state.action) {
      // ClientAction
      if (Number.isNaN(state.action) && env.registries.actions.contains(state.action)) {
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
        !Number.isNaN(state.action) &&
        currentActionId === parseInt(state.action, 10)
      ) {
        // only when we already have an action in dom
        try {
          // TODO: insert options into switchView
          const viewOptions: ViewOptions = {};
          if (state.id) {
            viewOptions.recordId = parseInt(state.id, 10);
          }
          let viewType = state.view_type;
          if (!viewType) {
            const controller = controllerStack[controllerStack.length - 1] as ViewController;
            viewType = controller.view.type;
          }
          switchView(viewType, viewOptions);
          return true;
        } catch (e) {}
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
          additional_context: context,
          resID: state.id || undefined, // empty string with bbq
          viewType: state.view_type,
        });
      }
    } else if (state.model && (state.view_type || state.id)) {
      if (state.id) {
        action = {
          res_model: state.model,
          res_id: state.id,
          type: "ir.actions.act_window",
          views: [[state.view_id || false, "form"]],
        };
      } else if (state.view_type) {
        // this is a window action on a multi-record view, so restore it
        // from the session storage
        // const storedAction = this.call('session_storage', 'getItem', 'current_action');
        const lastAction = JSON.parse(/*storedAction ||*/ "{}");
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

  return {
    doAction,
    switchView,
    restore,
    loadState,
  };
}

export const actionManagerService: Service<ActionManager> = {
  name: "action_manager",
  dependencies: ["notifications", "rpc", "router", "user"],
  deploy(env: OdooEnv): ActionManager {
    return makeActionManager(env);
  },
};
