import { OdooEnv, Service } from "../types";

export interface Menu {
  id: number | string;
  children: number[];
  name: string;
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
  getMenu(menuID: keyof MenuData): Menu;
  getMenuAsTree(menuID: keyof MenuData): MenuTree;
}

const loadMenusUrl = `/wowl/load_menus`;

async function fetchLoadMenus(env: OdooEnv, url: string): Promise<MenuData> {
  const res = await env.browser.fetch(url);
  if (!res.ok) {
    throw new Error("Error while fetching menus");
  }
  return res.json();
}

function makeMenus(env: OdooEnv, menusData: MenuData): MenuService {
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
    getMenuAsTree(menuID: keyof MenuData): MenuTree {
      const menu = this.getMenu(menuID) as MenuTree;
      if (!menu.childrenTree) {
        menu.childrenTree = menu.children.map((mid: Menu["id"]) => this.getMenuAsTree(mid));
      }
      return menu;
    },
  };
}

export const menusService: Service<MenuService> = {
  name: "menus",
  async deploy(env: OdooEnv, config): Promise<MenuService> {
    const { odoo } = config;
    const cacheHashes = odoo.session_info.cache_hashes;
    const loadMenusHash = cacheHashes.load_menus || new Date().getTime().toString();
    const menusData: MenuData = await fetchLoadMenus(env, `${loadMenusUrl}/${loadMenusHash}`);
    return makeMenus(env, menusData);
  },
};
