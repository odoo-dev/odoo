import { Component, hooks, tags } from "@odoo/owl";
import type { OdooEnv, Service, ComponentAction, FunctionAction } from "./../../types";
import {
  ActionRequest,
  ActionOptions,
  Action,
  ClientAction,
  ActWindowAction,
  ServerAction,
  Controller,
  ViewController,
} from "./helpers";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ActionManager {
  doAction(action: ActionRequest, options?: ActionOptions): void;
  getBreadcrumbs(): any;
  getViews(): any;
  switchView(viewType: string): void;
  restore(jsId: string): void;
}
interface SubRenderingInfo {
  id: number;
  Component: typeof Component;
  props: any;
}
interface RenderingInfo {
  main: SubRenderingInfo;
}
interface UpdateStackOptions {
  clearBreadcrumbs?: boolean;
  index?: number;
}

// -----------------------------------------------------------------------------
// ActionContainer (Component)
// -----------------------------------------------------------------------------

export class ActionContainer extends Component<{}, OdooEnv> {
  static template = tags.xml`
    <div t-name="wowl.ActionContainer">
      <t t-if="main.Component" t-component="main.Component" t-props="main.props" t-key="main.id"/>
    </div>`;
  main = {};
  constructor(...args: any[]) {
    super(...args);
    this.env.bus.on("action_manager:update", this, (info: RenderingInfo) => {
      this.main = info.main;
      this.render();
    });
    hooks.onMounted(() => this.env.bus.trigger("action_manager:finalize"));
    hooks.onPatched(() => this.env.bus.trigger("action_manager:finalize"));
  }
}

// -----------------------------------------------------------------------------
// ActionManager (Service)
// -----------------------------------------------------------------------------

function makeActionManager(env: OdooEnv): ActionManager {
  let id = 0;
  let controllerStack: Controller[] = [];

  env.bus.on("action_manager:finalize", null, () => {
    console.log("action mounted");
  });

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
    _updateStack(controller, { clearBreadcrumbs: options.clearBreadcrumbs });
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
      _updateStack(controller, { clearBreadcrumbs: options.clearBreadcrumbs });
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
    const nextAction = await env.services.rpc("/web/action/run", {
      action_id: action.id,
      context: action.context || {},
    });
    // nextAction = nextAction || { type: 'ir.actions.act_window_close' };
    _doAction(nextAction, options);
  }

  /**
   * Updates the controller stack and triggers a re-rendering.
   *
   * @param {Controller} controller
   * @param {UpdateStackOptions} options
   * @param {boolean} [options.clearBreadcrumbs=false]
   * @param {number} [options.index]
   */
  function _updateStack(controller: Controller, options: UpdateStackOptions = {}): void {
    let index = null;
    if (options.clearBreadcrumbs) {
      index = 0;
    } else if ("index" in options) {
      index = options.index;
    }
    if (index !== null) {
      controllerStack = controllerStack.slice(0, index);
    }
    controllerStack.push(controller);
    env.bus.trigger("action_manager:update", {
      main: {
        id: ++id,
        Component: controller.Component,
        props: { action: controller.action },
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
      case "ir.actions.act_url":
        throw new Error("URl actions not handled yet");
      case "ir.actions.report":
        throw new Error("Report actions not handled yet");
      case "ir.actions.act_window_close":
        throw new Error("ActWindowClose actions not handled yet");
      default:
        throw new Error(`The ActionManager service can't handle actions of type ${action.type}`);
    }
  }

  return {
    doAction: (...args) => {
      _doAction(...args);
    },
    getBreadcrumbs: () => {
      return controllerStack.map((controller) => {
        return {
          name: controller.action.name,
          id: controller.action.id,
          jsId: controller.jsId,
        };
      });
    },
    getViews: () => {
      const controller = controllerStack[controllerStack.length - 1] as ViewController;
      const multiRecord = controller.view.multiRecord;
      return controller.views.filter((view) => view.multiRecord === multiRecord);
    },
    switchView: (viewType) => {
      const controller = controllerStack[controllerStack.length - 1] as ViewController;
      if (controller.action.type !== 'ir.actions.act_window') {
        throw new Error(`switchView called but the current controller isn't a view`)
      }
      const view = controller.views.find((view: any) => view.type === viewType);
      if (view) {
        const newController = Object.assign({}, controller, {
          jsId: `controller_${++id}`,
          Component: view.Component,
          view,
        });
        const index = view.multiRecord ? controllerStack.length - 1 : controllerStack.length;
        _updateStack(newController, { index });
      }
    },
    restore: (jsId) => {
      const index = controllerStack.findIndex((controller) => controller.jsId === jsId);
      if (index < 0) {
        throw new Error("invalid controller to restore");
      }
      _updateStack(controllerStack[index], { index });
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
