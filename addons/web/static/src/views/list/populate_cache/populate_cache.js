import { Component } from "@odoo/owl";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { omit } from "@web/core/utils/objects";
import { FetchRecordError } from "@web/model/relational_model/errors";
import { STATIC_ACTIONS_GROUP_NUMBER } from "@web/search/action_menus/action_menus";

const cogMenuRegistry = registry.category("cogMenu");

class PopulateCache extends Component {
    static template = "web.PopulateCache";
    static components = { DropdownItem };
    static props = {};

    setup() {
        this.actionService = useService("action");
    }

    async onPopulateCache() {
        const originalRPC = rpc._rpc;
        let ids;
        if (this.env.model.root.groups) {
            ids = this.env.model.root.groups
                .map((g) => g.records.map((datapoint) => datapoint.resId))
                .flat();
        } else {
            ids = this.env.model.root.records.map((datapoint) => datapoint.resId);
        }
        const rpcCache = rpc.getCache();
        rpc._rpc = (url, params, settings) => {
            if (params.method === "web_read") {
                const newParams = { ...params };
                newParams.args[0] = ids;
                originalRPC(url, newParams, omit(settings, "cache")).then((result) => {
                    for (const res of result) {
                        const newParams = { ...params };
                        newParams.args[0] = [res.id];
                        const table = "web_read";
                        const key = JSON.stringify({ url, params: newParams });
                        rpcCache.populateIndexedDB(table, key, [res]);
                    }
                });
                return Promise.resolve([]);
            }
            return originalRPC(url, params, settings);
        };
        try {
            await this.actionService.switchView("form", { resId: ids[0], resIds: ids });
        } catch (error) {
            if (error.cause instanceof FetchRecordError) {
                // Do nothing !
            } else {
                throw error;
            }
        }
        rpc._rpc = originalRPC;
    }
}

export const populateCacheItem = {
    Component: PopulateCache,
    groupNumber: STATIC_ACTIONS_GROUP_NUMBER,
    isDisplayed: async ({ config, isSmall, model }) =>
        config.actionType === "ir.actions.act_window" &&
        ["kanban", "list"].includes(config.viewType) &&
        config.views.find((v) => v[1] === "form") &&
        !isSmall &&
        model.root.count &&
        !config.viewArch.getAttribute("action"),
};

cogMenuRegistry.add("populate-cache", populateCacheItem, { sequence: 100 });
