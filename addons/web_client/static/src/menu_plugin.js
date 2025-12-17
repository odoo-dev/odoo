import { computed, Plugin, signal } from "@odoo/owl";
import { registry } from "@web_core/registry";
import "@web_core/services";

/**
@typedef {{
    backgroundImage: string | null;
    children: number[];
}} RootMenuData

@typedef {{
    actionID: number;
    actionModel: string;
    actionPath: string;
    appID: number;
    children: number[];
    id: number;
    name: string;
    webIcon: string | false;
    webIconData: string | false;
    webIconDataMimetype: string | false;
    xmlid: string;
}} AppMenuData

@typedef {{
    actionID: number | false;
    actionModel: string | false;
    actionPath: string | false;
    appID: number;
    children: number[];
    id: number;
    name: string;
    xmlid: string;
}} MenuItemData

@typedef {{
    root: RootMenuData;
    [K: number]: AppMenuData | MenuItemData;
}} MenuDataMap
*/

class MenuItem {
    /** @type {number | null} */
    actionId;
    /** @type {number} */
    id;
    /** @type {MenuItem[]} */
    menuItems;
    /** @type {string} */
    name;
    /** @type {string | null} */
    path;
    /** @type {string | null} */
    resModel;
    /** @type {string} */
    xmlId;

    /**
     * @param {MenuItemData} menuItemData
     * @param {MenuDataMap} dataMap
     */
    constructor(menuItemData, dataMap) {
        this.actionId = menuItemData.actionID || null;
        this.id = menuItemData.id;
        this.menuItems = menuItemData.children.map((id) => {
            /** @type {any} */
            const menuItemData = dataMap[id];
            return new MenuItem(menuItemData, dataMap);
        });
        this.name = menuItemData.name;
        this.path = menuItemData.actionPath || null;
        this.resModel = menuItemData.actionModel || null;
        this.xmlId = menuItemData.xmlid;
    }
}

class AppMenu {
    /** @type {number} */
    actionId;
    /** @type {{ path: string | null; data: string | null; mimetype: string | null }} */
    icon;
    /** @type {number} */
    id;
    /** @type {MenuItem[]} */
    menuItems;
    /** @type {string} */
    name;
    /** @type {string | null} */
    path;
    /** @type {string} */
    resModel;
    /** @type {string} */
    xmlId;

    /**
     * @param {AppMenuData} appData
     * @param {MenuDataMap} dataMap
     */
    constructor(appData, dataMap) {
        this.actionId = appData.actionID || 0;
        this.icon = {
            data: appData.webIconData || null,
            mimetype: appData.webIconDataMimetype || null,
            path: appData.webIcon || null,
        };
        this.id = appData.id;
        this.menuItems = appData.children.map((id) => {
            /** @type {any} */
            const menuItemData = dataMap[id];
            return new MenuItem(menuItemData, dataMap);
        });
        this.name = appData.name;
        this.path = appData.actionPath || null;
        this.resModel = appData.actionModel || "";
        this.xmlId = appData.xmlid;
    }
}

class RootMenu {
    /** @type {{ [K: number]: AppMenu }} */
    apps = {};
    /** @type {string | null} */
    backgroundImage;

    /**
     * @param {MenuDataMap} dataMap
     */
    constructor(dataMap) {
        for (const childId of dataMap.root.children) {
            /** @type {any} */
            const appData = dataMap[childId];
            this.apps[childId] = new AppMenu(appData, dataMap);
        }
        this.backgroundImage = dataMap.root.backgroundImage;
    }
}

const LOAD_MENU_ROUTE = "/web/webclient/load_menus";
/** @type {RootMenuData} */
const DEFAULT_ROOT_MENU = {
    backgroundImage: null,
    children: [],
};

export class MenuPlugin extends Plugin {
    static id = this.name;
    static {
        registry.get("services").addById(this);
    }

    /** @private @type {import("@odoo/owl").Signal<RootMenu>} */
    _rootMenu = signal(new RootMenu({ root: DEFAULT_ROOT_MENU }));
    currentAppId = signal(1);

    apps = computed(() => this._rootMenu().apps);
    currentApp = computed(() => this.apps()[this.currentAppId()]);
    currentMenuItems = computed(() => {
        const app = this.currentApp();
        if (app) {
            return app.menuItems;
        }
        return [];
    });

    setup() {
        this.load();
    }

    /** @private */
    async _fetchMenus() {
        const response = await fetch(LOAD_MENU_ROUTE, { cache: "no-store" });
        if (!response.ok) {
            throw new Error("Error while fetching menus");
        }
        return response.json();
    }

    async load() {
        const dataMap = await this._fetchMenus();
        const rootMenu = new RootMenu(dataMap);
        this._rootMenu.set(rootMenu);
        console.log(this.apps());
    }
}
