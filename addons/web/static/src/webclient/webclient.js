/** @odoo-module **/

import { ActionContainer } from "../actions/action_container";
import { useService } from "../services/service_hook";
import { mainComponentRegistry } from "./main_component_registry";
import { NavBar } from "./navbar/navbar";

const { Component, hooks } = owl;

export class WebClient extends Component {
  setup() {
    this.menuService = useService("menu");
    this.actionService = useService("action");
    this.title = useService("title");
    this.router = useService("router");
    this.user = useService("user");
    this.Components = mainComponentRegistry.getEntries();
    this.title.setParts({ zopenerp: "Odoo" }); // zopenerp is easy to grep
    hooks.onMounted(() => {
      this.env.bus.on("ROUTE_CHANGE", this, this.loadRouterState);
      this.env.bus.on("ACTION_MANAGER:UI-UPDATED", this, (mode) => {
        if (mode !== "new") {
          this.el.classList.toggle("o_fullscreen", mode === "fullscreen");
        }
      });
      this.loadRouterState();
    });
  }

  mounted() {
    // the chat window and dialog services listen to 'web_client_ready' event in
    // order to initialize themselves:
    this.env.bus.trigger("WEB_CLIENT_READY");
  }

  loadRouterState() {
    let action = this.actionService.loadState();
    let menuId = Number(this.router.current.hash.menu_id || 0);

    if (!action && menuId) {
      // Determines the current action based on the current menu
      const menu = this.menuService.getAll().find((m) => menuId === m.id);
      action = menu && menu.actionID;
      if (action) {
        this.actionService.doAction(action, { clearBreadcrumbs: true });
      }
    }
    if (!action) {
      // If no action => falls back to the default app
      this._loadDefaultApp();
    }

    if (!menuId && typeof action === "number") {
      // Determines the current menu based on the current action
      const menu = this.menuService.getAll().find((m) => m.actionID === action);
      menuId = menu && menu.appID;
    }
    if (menuId) {
      // Sets the menu according to the current action
      this.menuService.setCurrentMenu(menuId);
    }
  }

  _loadDefaultApp() {
    // Selects the first root menu if any
    const root = this.menuService.getMenu("root");
    const firstApp = root.children[0];
    if (firstApp) {
      this.menuService.selectMenu(firstApp);
    }
  }
}
WebClient.components = { ActionContainer, NavBar };
WebClient.template = "web.WebClient";
