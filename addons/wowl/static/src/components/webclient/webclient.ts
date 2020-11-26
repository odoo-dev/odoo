import { ActionContainer, ActionOptions } from "../../action_manager/action_manager";
import { Component, hooks } from "@odoo/owl";
import { NavBar } from "../navbar/navbar";
import { OdooEnv } from "../../types";
import { useService } from "../../core/hooks";
import { Route } from "./../../services/router";

export class WebClient extends Component<{}, OdooEnv> {
  static components = { ActionContainer, NavBar };
  static template = "wowl.WebClient";
  menus = useService("menus");
  actionManager = useService("action_manager");
  title = useService("title");
  router = useService("router");
  user = useService("user");
  Components = this.env.registries.Components.getEntries();

  constructor(...args: any[]) {
    super(...args);
    this.title.setParts({ zopenerp: "Odoo" }); // zopenerp is easy to grep
    hooks.onMounted(() => {
      this.env.bus.on("ROUTE_CHANGE", this, this.loadRouterState);
      this.env.bus.on("ACTION_MANAGER:UI-UPDATED", this, (mode) => {
        if (mode !== "new") {
          this.el!.classList.toggle("o_fullscreen", mode === "fullscreen");
          setTimeout(() => this.replaceRouterState());
        }
      });
      this.loadRouterState();
    });
  }

  async loadRouterState(): Promise<void> {
    const options: ActionOptions = {
      clearBreadcrumbs: true,
    };
    const state = this.router.current.hash;
    let action: string | number | undefined = state.action;
    if (action && !Number.isNaN(action)) {
      action = parseInt(action, 10);
    }
    let menuId: number | undefined = state.menu_id ? parseInt(state.menu_id, 10) : undefined;
    const actionManagerHandles = await this.actionManager.loadState(state, options);
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
    if (menuId) {
      this.menus.setCurrentMenu(menuId);
    }
    if (!actionManagerHandles && !action) {
      return this._loadDefaultApp();
    }
  }

  async _loadDefaultApp(): Promise<void> {
    const action = this.user.home_action_id;
    if (action) {
      // Don't know what to do here: should we set the menu
      // even if it's a guess ?
      return this.actionManager.doAction(action, { clearBreadcrumbs: true });
    }
    const root = this.menus.getMenu("root");
    const firstApp = root.children[0];
    if (firstApp) {
      return this.menus.selectMenu(firstApp);
    }
  }

  replaceRouterState(): void {
    const currentApp = this.menus.getCurrentApp();
    const persistentHash: Route["hash"] = {
      menu_id: currentApp && `${currentApp.id}`,
    };
    const allowedCompanyIds = this.user.context.allowed_company_ids;
    if (allowedCompanyIds) {
      persistentHash.cids = allowedCompanyIds.join(",");
    }
    this.router.replaceState(persistentHash);
  }
}
