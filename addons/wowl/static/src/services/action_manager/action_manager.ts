import { Component, hooks, tags } from "@odoo/owl";
import type { OdooEnv, Service, FunctionAction } from "./../../types";
import { ActionRequest, ActionOptions, Action, ClientAction, ServerAction } from "./helpers";

interface ActionManager {
  doAction(action: ActionRequest, options?: ActionOptions): void;
}

export class ActionContainer extends Component<{}, OdooEnv> {
  static template = tags.xml`
    <div t-name="wowl.ActionContainer">
      <t t-foreach="slots" t-as="slot" t-key="slot.name">
        <t t-component="slot.Component" slot="slot" />
      </t>
    </div>`;
  slots = {};
  constructor(...args: any[]) {
    super(...args);
    this.env.bus.on("action_manager:update", this, (slots) => {
      this.slots = slots;
      this.render();
    });
    hooks.onMounted(() => this.env.bus.trigger("action_manager:finalize"));
    hooks.onPatched(() => this.env.bus.trigger("action_manager:finalize"));
  }
}

function makeActionManager(env: OdooEnv): ActionManager {
  let actionId = 0;
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
    } else  {
      // actionRequest is an object describing the action
      action = Object.assign({}, actionRequest);
    }
    action.jsId = `action_${++actionId}`;
    return action;
  };
  env.bus.on("action_manager:finalize", null, () => {
    console.log("action mounted");
  });

  async function doAction(actionRequest: ActionRequest, options?: ActionOptions) {
    let action = await loadAction(actionRequest, options || {});
    if (action.type === "ir.actions.client") {
      const clientAction = env.registries.actions.get((action as ClientAction).tag);
      if (clientAction.prototype instanceof Component) {
        // the client action is a component
        env.bus.trigger("action_manager:update", [
          {
            name: "main",
            Component: clientAction,
            action: action,
          },
        ]);
      } else {
        // the client action is a function
        (clientAction as FunctionAction)();
      }
    } else if (action.type === "ir.actions.server") {
      const newAction = await env.services.rpc('/web/action/run', {
        action_id: action.id,
        context: action.context || {},
      });
      // action = action || { type: 'ir.actions.act_window_close' };
      doAction(newAction);
    }
  }

  return {
    doAction: (...args) => {
      doAction(...args);
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
