import { Component, hooks, tags } from "@odoo/owl";
import type { OdooEnv, Service, FunctionAction } from "./../../types";
import { ActionRequest, ActionOptions, Action, ClientAction } from "./helpers";

interface ActionManager {
  doAction(action: ActionRequest, options?: ActionOptions): void;
  getBreadcrumbs(): any;
}
interface SubRenderingInfo {
  id: number;
  Component: typeof Component;
  props: any;
}
interface RenderingInfo {
  main: SubRenderingInfo;
}

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

function makeActionManager(env: OdooEnv): ActionManager {
  let id = 0;
  let actionStack: any[] = [];
  const loadAction = async (
    actionRequest: ActionRequest,
    options: ActionOptions
  ): Promise<Action> => {
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
  };
  env.bus.on("action_manager:finalize", null, () => {
    console.log("action mounted");
  });

  async function doAction(actionRequest: ActionRequest, options?: ActionOptions): Promise<any> {
    options = options || {};
    let action = await loadAction(actionRequest, options);
    let Comp;
    if (action.type === "ir.actions.client") {
      const clientAction = env.registries.actions.get((action as ClientAction).tag);
      if (clientAction.prototype instanceof Component) {
        // the client action is a component
        Comp = clientAction;
      } else {
        // the client action is a function
        return (clientAction as FunctionAction)();
      }
    } else if (action.type === "ir.actions.act_window") {
      const view = env.registries.views.get("form"); // FIXME: get the first view here
      Comp = view.Component;
    } else if (action.type === "ir.actions.server") {
      const nextAction = await env.services.rpc("/web/action/run", {
        action_id: action.id,
        context: action.context || {},
      });
      // nextAction = nextAction || { type: 'ir.actions.act_window_close' };
      return doAction(nextAction);
    }

    // if we get here, it means that the action requires an update of the UI
    if (options.clear_breadcrumbs) {
      actionStack = [];
    }
    actionStack.push(action);
    env.bus.trigger("action_manager:update", {
      main: {
        id: ++id,
        Component: Comp,
        props: { action },
      },
    });
  }

  return {
    doAction: (...args) => {
      doAction(...args);
    },
    getBreadcrumbs: () => {
      return actionStack.map((action) => {
        return { name: action.name };
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
