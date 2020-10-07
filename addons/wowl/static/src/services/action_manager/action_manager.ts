import { Component, hooks, tags } from "@odoo/owl";
import type { OdooEnv } from "./../../env";
import { Service, ServiceParams } from "../../services";
import { ActionRequest, ActionOptions, ClientAction, FunctionAction } from "./helpers";

interface ActionManager {
  doAction(action: ActionRequest, options: ActionOptions): void;
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
  const loadAction = (action: ActionRequest, options: ActionOptions): ClientAction => {
    // FIXME: rpc load action
    let _action: ClientAction;
    if (typeof action === "string") {
      _action = {
        Action: env.registries.actions.get(action),
        jsId: `action_${++actionId}`,
        target: "current",
        type: "ir.actions.client",
      };
    } else {
      throw new Error("Case not supported yet");
    }
    return _action;
  };
  env.bus.on("action_manager:finalize", null, () => {
    console.log("action mounted");
  });

  async function doAction(action: ActionRequest, options: ActionOptions) {
    const _action = await loadAction(action, options);
    if (_action.Action.prototype instanceof Component) {
      env.bus.trigger("action_manager:update", [
        {
          name: "main",
          Component: _action.Action,
          action: _action,
        },
      ]);
    } else {
      (_action.Action as FunctionAction)();
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
  dependencies: ["rpc", "menus"],
  deploy(params: ServiceParams): ActionManager {
    return makeActionManager(params.env);
  },
};
