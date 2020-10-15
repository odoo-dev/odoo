import { ActionContainer, ActionOptions } from "../../services/action_manager/action_manager";
import { Component, hooks } from "@odoo/owl";
import { NavBar } from "../navbar/navbar";
import { OdooEnv } from "../../types";
import { useService } from "../../core/hooks";

export class WebClient extends Component<{}, OdooEnv> {
  static components = { ActionContainer, NavBar };
  static template = "wowl.WebClient";
  menus = useService("menus");
  actionManager = useService("action_manager");
  router = useService("router");
  Components = this.env.registries.Components.getEntries();
  constructor(...args: any[]) {
    super(...args);
    hooks.onMounted(() => {
      this.env.bus.on("ROUTE_CHANGE", this, this._loadRouterState);
      this._loadRouterState();
      this.env.bus.on("ACTION_MANAGER:UI-UPDATED", this, this._onUiUpdated);
    });
  }
  async _loadRouterState() {
    const options: ActionOptions = {
      clearBreadcrumbs: true,
    };
    const state = this.router.current.hash;
    let action: string | number | undefined = state.action;
    if (action && !Number.isNaN(action)) {
      action = parseInt(state.action, 10);
    }
    let menuId: number | undefined = state.menu_id ? parseInt(state.menu_id, 10) : undefined;
    const actionManagerHandles = await this.actionManager.loadRouterState(state, options);
    if (!actionManagerHandles) {
      if (!action && menuId) {
        // determine action from menu_id key
        const menu = this.menus.getAll().find((m) => menuId === m.id);
        action = menu && menu.actionID;
      }
      if (action) {
        await this.actionManager.doAction(action, options);
      }
    }
    // Determine the app we are in
    if (!menuId && typeof action === "number") {
      const menu = this.menus.getAll().find((m) => m.actionID === action);
      menuId = (menu && menu.appID) as number;
    }
    this.menus.setCurrentMenu(menuId);
  }
  async _onUiUpdated({
    updatedMode,
    action,
  }: {
    updatedMode: "dialog" | "main";
    action?: any;
  }): Promise<void> {
    if (updatedMode === "dialog" || !action) {
      return;
    }
    await new Promise((r) => {
      this.env.browser.setTimeout(r);
    }); // wait for promise callbacks to execute
    const newState: any = {};
    if (action.id) {
      newState.action = action.id;
    }
    const menu = this.menus.getCurrentApp();
    if (menu) {
      newState.menu_id = menu.id;
    }
    this.router.pushState(newState, true);
  }
}
