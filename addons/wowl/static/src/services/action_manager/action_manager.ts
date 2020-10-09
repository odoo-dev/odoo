import { Component, hooks, tags } from "@odoo/owl";
import type { OdooEnv, Service, ComponentAction, FunctionAction } from "./../../types";
import {
  ActionRequest,
  ActionOptions,
  Action,
  ClientAction,
  ActWindowAction,
  ServerAction,
} from "./helpers";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ActionManager {
  doAction(action: ActionRequest, options?: ActionOptions): void;
  getBreadcrumbs(): any;
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
  let actionStack: any[] = [];

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
    const view = env.registries.views.get("form"); // FIXME: get the first view here
    action.Component = view.Component;
    _updateStack(action, options);
  }

  /**
   * Executes an action of type 'ir.actions.client'.
   *
   * @param {ClientAction} action
   */
  function _executeClientAction(action: ClientAction, options: ActionOptions): void {
    const clientAction = env.registries.actions.get(action.tag);
    if (clientAction.prototype instanceof Component) {
      action.Component = clientAction as ComponentAction;
      _updateStack(action, options);
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
   * Updates the action stack and triggers a re-rendering.
   *
   * @param {ClientAction | ActWindowAction} action
   * @param {ActionOptions} options
   */
  function _updateStack(action: ClientAction | ActWindowAction, options: ActionOptions): void {
    if (options.clear_breadcrumbs) {
      actionStack = [];
    }
    actionStack.push(action);
    env.bus.trigger("action_manager:update", {
      main: {
        id: ++id,
        Component: (action as ClientAction | ActWindowAction).Component,
        props: { action },
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
  async function _doAction(actionRequest: ActionRequest, options?: ActionOptions): Promise<any> {
    options = options || {};
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
      return actionStack.map((action) => {
        return {
          name: action.name,
          id: action.id,
          jsId: action.jsId,
        };
      });
    },
    restore: (jsId) => {
      const index = actionStack.findIndex((action) => action.jsId === jsId);
      if (index < 0) {
        throw new Error("invalid action to restore");
      }
      const action = actionStack[index];
      actionStack = actionStack.slice(0, index + 1);
      env.bus.trigger("action_manager:update", {
        main: {
          id: ++id,
          Component: action.Component,
          props: { action },
        },
      });
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
