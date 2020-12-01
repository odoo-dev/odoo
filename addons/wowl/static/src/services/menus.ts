import { OdooEnv, Service } from "../types";

export interface Menu {
  id: number | string;
  children: number[];
  name: string;
  appID?: Menu["id"];
  actionID?: number;
}

export interface MenuTree extends Menu {
  childrenTree?: MenuTree[];
}

export interface MenuData {
  [id: number]: Menu;
  [key: string]: Menu;
}

export interface MenuService {
  getAll(): Menu[];
  getApps(): Menu[];
  getCurrentApp(): Menu | undefined;
  getMenu(menuID: keyof MenuData): Menu;
  getMenuAsTree(menuID: keyof MenuData): MenuTree;
  selectMenu(menu: Menu | Menu["id"]): Promise<void>;
  setCurrentMenu(menu: Menu | Menu["id"]): void;
}

const loadMenusUrl = `/wowl/load_menus`;

async function fetchLoadMenus(url: string): Promise<MenuData> {
  const res = await odoo.browser.fetch(url);
  if (!res.ok) {
    throw new Error("Error while fetching menus");
  }
  return res.json();
}

function makeMenus(env: OdooEnv, menusData: MenuData): MenuService {
  let currentAppId: Menu["appID"];
  return {
    getAll(): Menu[] {
      return Object.values(menusData);
    },
    getApps(): Menu[] {
      return this.getMenu("root").children.map((mid: Menu["id"]) => this.getMenu(mid));
    },
    getMenu(menuID: keyof MenuData): Menu {
      return menusData[menuID];
    },
    getCurrentApp(): Menu | undefined {
      if (!currentAppId) {
        return;
      }
      return this.getMenu(currentAppId);
    },
    getMenuAsTree(menuID: keyof MenuData): MenuTree {
      const menu = this.getMenu(menuID) as MenuTree;
      if (!menu.childrenTree) {
        menu.childrenTree = menu.children.map((mid: Menu["id"]) => this.getMenuAsTree(mid));
      }
      return menu;
    },
    async selectMenu(menu: Menu | Menu["id"]) {
      menu = (typeof menu === "number" ? this.getMenu(menu) : menu) as Menu;
      if (!menu.actionID) {
        return;
      }
      await env.services.action_manager.doAction(menu.actionID, { clearBreadcrumbs: true });
      this.setCurrentMenu(menu);
    },
    setCurrentMenu(menu: Menu | Menu["id"]) {
      menu = (typeof menu === "number" ? this.getMenu(menu) : menu) as Menu;
      if (menu && menu.appID !== currentAppId) {
        currentAppId = menu.appID;
        env.bus.trigger("MENUS:APP-CHANGED");
      }
    },
  };
}

export const menusService: Service<MenuService> = {
  name: "menus",
  dependencies: ["action_manager"],
  async deploy(env: OdooEnv): Promise<MenuService> {
    const cacheHashes = odoo.session_info.cache_hashes;
    const loadMenusHash = cacheHashes.load_menus || new Date().getTime().toString();
    const menusData: MenuData = await fetchLoadMenus(`${loadMenusUrl}/${loadMenusHash}`);
    return makeMenus(env, menusData);
  },
};
