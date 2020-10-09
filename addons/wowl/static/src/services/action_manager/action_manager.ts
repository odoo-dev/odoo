import { Component, tags } from "@odoo/owl";
import { Dialog } from "../../components/dialog/dialog";
import type { OdooEnv, Service, ComponentAction, FunctionAction, Type, View } from "./../../types";

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
type ActionId = number;
type ActionXMLId = string;
type ActionTag = string;
export interface ActionDescription {
  target?: ActionTarget;
  type: ActionType;
  [key: string]: any;
}
type ActionRequest = ActionId | ActionXMLId | ActionTag | ActionDescription;
interface ActionOptions {
  clearBreadcrumbs?: boolean;
}

export interface Action {
  id?: number;
  jsId: string;
  name: string;
  context: object;
  target: "current" | "new";
  type: ActionType;
}
interface ClientAction extends Action {
  tag: string;
  type: "ir.actions.client";
}
type ViewId = number | false;
type ViewType = string;
interface ActWindowAction extends Action {
  type: "ir.actions.act_window";
  res_model: string;
  views: [ViewId, ViewType][];
}
interface ServerAction extends Action {
  id: number;
  type: "ir.actions.server";
}

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

interface SubRenderingInfo {
  id: number;
  Component: Type<Component<{}, OdooEnv>>;
  props: ControllerProps;
}
interface RenderingInfo {
  main: SubRenderingInfo;
  dialog: SubRenderingInfo;
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
    this.env.bus.on("action_manager:update", this, (info: RenderingInfo) => {
      this.main = info.main || this.main;
      this.dialog = info.dialog || {};
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

  /**
   * Given an id, xmlid, tag (key of the client action registry) or directly an
   * object describing an action, this function returns an action description
   * with a unique jsId.
   *
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
   * Executes an action of type 'ir.actions.act_window'.
   *
   * @param {ActWindowAction} action
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

  /**
   * Executes an action of type 'ir.actions.client'.
   *
   * @param {ClientAction} action
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

  /**
   * Executes an action of type 'ir.actions.server'.
   *
   * @param {ServerAction} action
   */
  async function _executeServerAction(action: ServerAction, options: ActionOptions): Promise<void> {
    let nextAction = await env.services.rpc("/web/action/run", {
      action_id: action.id,
      context: action.context || {},
    });
    nextAction = nextAction || { type: "ir.actions.act_window_close" };
    _doAction(nextAction, options);
  }

  /**
   * Given a controller stack, return the list of breadcrumb items.
   *
   * @param {ControllerStack} stack
   * @returns {Breadcrumbs}
   */
  function _getBreadcrumbs(stack: ControllerStack): Breadcrumbs {
    return stack.map((controller) => {
      return {
        jsId: controller.jsId,
        name: controller.action.name,
      };
    });
  }

  /**
   * Given a controller, return the list of views of the same type (mono or
   * multi-record), to display in the view switcher.
   *
   * @param {ViewController} controller
   * @returns {View[]}
   */
  function _getViews(controller: ViewController): View[] {
    const multiRecord = controller.view.multiRecord;
    return controller.views.filter((view) => view.multiRecord === multiRecord);
  }

  /**
   * Trigger a re-rendering with respect to the given controller.
   *
   * @param {Controller} controller
   * @param {UpdateStackOptions} options
   * @param {boolean} [options.clearBreadcrumbs=false]
   * @param {number} [options.index]
   */
  function _updateUI(controller: Controller, options: UpdateStackOptions = {}): void {
    const action = controller.action;
    if (action.target === "new") {
      env.bus.trigger("action_manager:update", {
        dialog: {
          id: ++id,
          Component: controller.Component,
          props: { action },
        },
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

    env.bus.trigger("action_manager:update", {
      main: {
        id: ++id,
        Component: Controller,
        props,
      },
    });
  }

  /**
   * Main entry point of a 'doAction' request. Loads the action and executes it.
   *
   * @param {ActionRequest} actionRequest
   * @param {ActionOptions} options
   * @returns {Promise<any>}
   */
  async function _doAction(
    actionRequest: ActionRequest,
    options: ActionOptions = {}
  ): Promise<any> {
    const action = await _loadAction(actionRequest, options);
    switch (action.type) {
      case "ir.actions.act_window":
        return _executeActWindowAction(action as ActWindowAction, options);
      case "ir.actions.client":
        return _executeClientAction(action as ClientAction, options);
      case "ir.actions.server":
        return _executeServerAction(action as ServerAction, options);
      case "ir.actions.act_window_close":
        return env.bus.trigger("action_manager:update", {});
      case "ir.actions.act_url":
        throw new Error("URl actions not handled yet");
      case "ir.actions.report":
        throw new Error("Report actions not handled yet");
      default:
        throw new Error(`The ActionManager service can't handle actions of type ${action.type}`);
    }
  }

  return {
    doAction: (...args) => {
      _doAction(...args);
    },
    switchView: (viewType) => {
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
    },
    restore: (jsId) => {
      const index = controllerStack.findIndex((controller) => controller.jsId === jsId);
      if (index < 0) {
        throw new Error("invalid controller to restore");
      }
      _updateUI(controllerStack[index], { index });
    },
  };
}

export const actionManagerService: Service<ActionManager> = {
  name: "action_manager",
  dependencies: ["rpc"],
  deploy(env: OdooEnv): ActionManager {
    return makeActionManager(env);
  },
};
