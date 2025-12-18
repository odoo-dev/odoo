import { computed, Plugin, signal } from "@odoo/owl";
import { serviceRegistry } from "@web_core/services";

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

export class MenuItem {
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

export class AppMenu {
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
    /** @type {AppMenu[]} */
    appList = [];
    /** @type {{ [K: number]: AppMenu }} */
    appMap = {};
    /** @type {string | null} */
    backgroundImage;

    /**
     * @param {MenuDataMap} dataMap
     */
    constructor(dataMap) {
        for (const childId of dataMap.root.children) {
            /** @type {any} */
            const appData = dataMap[childId];
            const appMenu = new AppMenu(appData, dataMap);
            this.appMap[childId] = appMenu;
            this.appList.push(appMenu);
        }
        this.backgroundImage = dataMap.root.backgroundImage;
    }
}

/** @type {RootMenuData} */
const DEFAULT_ROOT_MENU = {
    backgroundImage: null,
    children: [],
};

export class MenuPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    /** @private @type {import("@odoo/owl").Signal<RootMenu>} */
    _rootMenu = signal(new RootMenu({ root: DEFAULT_ROOT_MENU }));
    currentAppId = signal(0);

    apps = computed(() => this._rootMenu().appList);
    currentApp = computed(() => this._rootMenu().appMap[this.currentAppId()]);
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

    /** @private @returns {Promise<MenuDataMap>} */
    async _fetchMenus() {
        const response = await fetch("/web/webclient/load_menus", { cache: "no-store" });
        if (!response.ok) {
            throw new Error("Error while fetching menus");
        }
        return response.json();
    }

    async load() {
        const dataMap = await this._fetchMenus();
        const rootMenu = new RootMenu(dataMap);
        this._rootMenu.set(rootMenu);
        this.currentAppId.set(dataMap.root.children[0]);
        console.log(this.apps());
    }
}
