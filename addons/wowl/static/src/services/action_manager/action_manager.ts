import { Component, tags } from "@odoo/owl";
import { Dialog } from "../../components/dialog/dialog";
import type {
  OdooEnv,
  Service,
  ComponentAction,
  FunctionAction,
  Type,
  View,
  ViewType,
} from "./../../types";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type ActionType =
  | "ir.actions.act_url"
  | "ir.actions.act_window"
  | "ir.actions.act_window_close"
  | "ir.actions.client"
  | "ir.actions.report"
  | "ir.actions.server";
type ActionTarget = "current" | "main" | "new" | "fullscreen" | "inline";
type URLActionTarget = "self";
type ActionId = number;
type ActionXMLId = string;
type ActionTag = string;
export interface ActionDescription {
  target?: ActionTarget;
  type: ActionType;
  [key: string]: any;
}
export type ActionRequest = ActionId | ActionXMLId | ActionTag | ActionDescription;
interface ActionOptions {
  clearBreadcrumbs?: boolean;
}

interface Context {
  [key: string]: any;
}

export interface Action {
  id?: number;
  jsId: string;
  display_name?: string;
  name?: string;
  context?: Context;
  target?: ActionTarget | URLActionTarget;
  type: ActionType;
}
interface ClientAction extends Action {
  tag: string;
  type: "ir.actions.client";
}
type ViewId = number | false;
interface ActWindowAction extends Action {
  type: "ir.actions.act_window";
  res_model: string;
  views: [ViewId, ViewType][];
}
interface ServerAction extends Action {
  id: number;
  type: "ir.actions.server";
}
interface ActURLAction extends Action {
  target?: URLActionTarget;
  type: "ir.actions.act_url";
  url: string;
}
interface ReportAction extends Action {
  close_on_report_download?: boolean;
  data?: any;
  report_file?: string;
  report_name: string;
  report_type: "qweb-html" | "qweb-pdf" | "qweb-text";
}

type ReportType = "html" | "pdf" | "text";
type WkhtmltopdfState = "ok" | "broken" | "install" | "upgrade" | "workers";

interface Controller {
  jsId: string;
  Component: Type<Component<{}, OdooEnv>>;
  action: ClientAction | ActWindowAction;
}
interface ViewController extends Controller {
  action: ActWindowAction;
  view: View;
  views: View[];
}
type ControllerStack = Controller[];

interface Breadcrumb {
  jsId: string;
  name: string;
}
type Breadcrumbs = Breadcrumb[];
interface ControllerProps {
  action: ClientAction | ActWindowAction;
  breadcrumbs: Breadcrumbs;
  views?: View[];
}

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

interface ActionManager {
  doAction(action: ActionRequest, options?: ActionOptions): void;
  switchView(viewType: string): void;
  restore(jsId: string): void;
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
  main = {};
  dialog = {};
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
    if (typeof actionRequest === "string" && env.registries.actions.contains(actionRequest)) {
      // actionRequest is a key in the actionRegistry
      action = {
        target: "current",
        tag: actionRequest,
        type: "ir.actions.client",
      } as ClientAction;
    } else if (["string", "number"].includes(typeof actionRequest)) {
      // actionRequest is an id or an xmlid
      action = await env.services.rpc("/web/action/load", { action_id: actionRequest });
    } else {
      // actionRequest is an object describing the action
      action = Object.assign({}, actionRequest);
    }
    action.jsId = `action_${++id}`;
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
   * Given a controller, returns the list of views of the same type (mono or
   * multi-record), to display in the view switcher.
   *
   * @private
   * @param {ViewController} controller
   * @returns {View[]}
   */
  function _getViews(controller: ViewController): View[] {
    const multiRecord = controller.view.multiRecord;
    return controller.views.filter((view) => view.multiRecord === multiRecord);
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
  function _updateUI(controller: Controller, options: UpdateStackOptions = {}): void {
    const action = controller.action;
    if (action.target === "new") {
      env.bus.trigger("ACTION_MANAGER:UPDATE", {
        type: "OPEN_DIALOG",
        id: ++id,
        Component: controller.Component,
        props: { action },
      });
      return;
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

    class Controller extends Component {
      static template = tags.xml`<t t-component="Component" t-props="props"/>`;
      Component = controller.Component;
      mounted() {
        controllerStack = nextStack; // the controller is mounted, commit the new stack
      }
    }

    const props: ControllerProps = {
      action,
      breadcrumbs: _getBreadcrumbs(nextStack),
    };
    if (controller.action.type === "ir.actions.act_window") {
      props.views = _getViews(controller as ViewController);
    }

    env.bus.trigger("ACTION_MANAGER:UPDATE", {
      type: "MAIN",
      id: ++id,
      Component: Controller,
      props,
    });
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
  function _executeActWindowAction(action: ActWindowAction, options: ActionOptions): void {
    const views = [];
    for (const [_, type] of action.views) {
      if (env.registries.views.contains(type)) {
        views.push(env.registries.views.get(type));
      }
    }
    if (!views.length) {
      throw new Error(`No view found for act_window action ${action.id}`);
    }
    const controller: ViewController = {
      jsId: `controller_${++id}`,
      Component: views[0].Component,
      action,
      view: views[0],
      views,
    };
    _updateUI(controller, { clearBreadcrumbs: options.clearBreadcrumbs });
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
  function _executeClientAction(action: ClientAction, options: ActionOptions): void {
    const clientAction = env.registries.actions.get(action.tag);
    if (clientAction.prototype instanceof Component) {
      const controller: Controller = {
        jsId: `controller_${++id}`,
        Component: clientAction as ComponentAction,
        action,
      };
      _updateUI(controller, { clearBreadcrumbs: options.clearBreadcrumbs });
    } else {
      (clientAction as FunctionAction)();
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
    console.log(`download report ${url}`);
    if (action.close_on_report_download) {
      doAction({ type: "ir.actions.act_window_close" });
    }
  }

  function _executeReportClientAction(action: ReportAction, options: ActionOptions): void {
    const clientActionOptions = Object.assign({}, options, {
      context: action.context,
      data: action.data,
      display_name: action.display_name,
      name: action.name,
      report_file: action.report_file,
      report_name: action.report_name,
      report_url: _getReportUrl(action, "html"),
    });
    doAction("report.client_action", clientActionOptions);
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
      _executeReportClientAction(action, options);
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
    doAction(nextAction, options);
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
        return _executeActURLAction(action as ActURLAction);
      case "ir.actions.act_window":
        return _executeActWindowAction(action as ActWindowAction, options);
      case "ir.actions.act_window_close":
        return env.bus.trigger("ACTION_MANAGER:UPDATE", { type: "CLOSE_DIALOG" });
      case "ir.actions.client":
        return _executeClientAction(action as ClientAction, options);
      case "ir.actions.report":
        return _executeReportAction(action as ReportAction, options);
      case "ir.actions.server":
        return _executeServerAction(action as ServerAction, options);
      default:
        throw new Error(`The ActionManager service can't handle actions of type ${action.type}`);
    }
  }

  /**
   * Switches to the given view type in action of the last controller of the
   * stack. This action must be of type 'ir.actions.act_window'.
   *
   * @param {ViewType} viewType
   */
  function switchView(viewType: ViewType): void {
    const controller = controllerStack[controllerStack.length - 1] as ViewController;
    if (controller.action.type !== "ir.actions.act_window") {
      throw new Error(`switchView called but the current controller isn't a view`);
    }
    const view = controller.views.find((view: any) => view.type === viewType);
    if (view) {
      const newController = Object.assign({}, controller, {
        jsId: `controller_${++id}`,
        Component: view.Component,
        view,
      });
      const index = view.multiRecord ? controllerStack.length - 1 : controllerStack.length;
      _updateUI(newController, { index });
    }
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

  return {
    doAction: (...args) => {
      doAction(...args);
    },
    switchView,
    restore,
  };
}

export const actionManagerService: Service<ActionManager> = {
  name: "action_manager",
  dependencies: ["notifications", "rpc"],
  deploy(env: OdooEnv): ActionManager {
    return makeActionManager(env);
  },
};
