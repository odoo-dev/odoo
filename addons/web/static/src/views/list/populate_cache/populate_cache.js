import { Component } from "@odoo/owl";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { registry } from "@web/core/registry";
import { STATIC_ACTIONS_GROUP_NUMBER } from "@web/search/action_menus/action_menus";

const cogMenuRegistry = registry.category("cogMenu");

class PopulateCache extends Component {
    static template = "web.PopulateCache";
    static components = { DropdownItem };
    static props = {};

    async onPopulateCache() {
        // IDs if grouped :
        // this.env.model.root.groups.map((g) => g.records.map((r) => r.data.id)).flat()
        // debugger;
    }
}

export const populateCacheItem = {
    Component: PopulateCache,
    groupNumber: STATIC_ACTIONS_GROUP_NUMBER,
    isDisplayed: async ({ config, isSmall, model }) =>
        !isSmall &&
        model.root.count &&
        config.actionType === "ir.actions.act_window" &&
        ["kanban", "list"].includes(config.viewType) &&
        !config.viewArch.getAttribute("action"),
};

cogMenuRegistry.add("populate-cache", populateCacheItem, { sequence: 100 });
