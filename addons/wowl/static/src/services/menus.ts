import { Odoo } from "../types";
import { OdooEnv } from "../env";
import { Service } from "../services";

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

async function makeMenus(env: OdooEnv, loadMenusHash: string): Promise<MenuService> {
  const menusData: MenuData = await fetchLoadMenus(env, `${loadMenusUrl}/${loadMenusHash}`);
  const menuService: MenuService = {
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
  return menuService;
}
export const menusService: Service<MenuService> = {
  name: "menus",
  async deploy(env: OdooEnv, odoo: Odoo): Promise<MenuService> {
    const cacheHashes = ((odoo ? odoo.session_info.cache_hashes : {}) || {}) as any;
    const loadMenusHash = cacheHashes.load_menus || new Date().getTime().toString();
    delete cacheHashes.load_menus;
    return makeMenus(env, loadMenusHash);
  },
};
