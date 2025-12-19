import { plugin, Plugin } from "@odoo/owl";
import { DisplayedActionPlugin } from "@web_client/action/displayed_action_plugin";
import { notify } from "@web_core/notification/notification_plugin";
import { RPC } from "@web_core/rpc";
import { serviceRegistry } from "@web_core/services";
import { session } from "@web_core/session";
import { actionRegistry } from "./action_registry";
import { ViewAction } from "@web_client/action/view_action";

export class ActionPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    display = plugin(DisplayedActionPlugin);
    rpc = plugin(RPC);

    /**
     * @param {string | number | Record<string, any>} request
     */
    async doAction(request) {
        const description = await this._loadActionDescription(request);
        switch (description.type) {
            case "ir.actions.act_url":
                return this._executeUrlAction(description);
            case "ir.actions.act_window":
                return this._executeWindowAction(description);
            case "ir.actions.act_window_close":
                return this._executeWindowCloseAction(description);
            case "ir.actions.client":
                return this._executeClientAction(description);
            case "ir.actions.server":
                return this._executeServerAction(description);
            case "ir.actions.report":
                return this._executeReportAction(description);
            default:
                notify(`Unknown action type "${description.type}"`, { type: "danger" });
        }
    }

    /**
     * @private
     * @param {string | number | Record<string, any>} request
     */
    async _loadActionDescription(request) {
        if (typeof request === "string" && actionRegistry.has(request)) {
            // request is a tag of a client action.
            return {
                tag: request,
                target: "current",
                type: "ir.actions.client",
            };
        }

        if (["string", "number"].includes(typeof request)) {
            // request is an action id or a xmlid.
            return this.rpc.call("/web/action/load", {
                action_id: request,
                context: session.user_context,
            });
        }

        // request is an object describing the action.
        return request;
    }

    /**
     * @private
     * @param {Record<string, any>} description
     */
    _executeClientAction(description) {
        const actionId = description.tag;
        if (actionRegistry.has(actionId)) {
            this.display.setDisplay(actionRegistry.get(actionId), description);
        } else {
            notify("Nope, action does not exist");
        }
    }

    /**
     * @private
     * @param {Record<string, any>} description
     */
    _executeReportAction(description) {
        notify(`Not implemented action type "${description.type}"`, { type: "danger" });
    }

    /**
     * @private
     * @param {Record<string, any>} description
     */
    _executeServerAction(description) {
        notify(`Not implemented action type "${description.type}"`, { type: "danger" });
    }

    /**
     * @private
     * @param {Record<string, any>} description
     */
    _executeUrlAction(description) {
        notify(`Not implemented action type "${description.type}"`, { type: "danger" });
    }

    /**
     * @private
     * @param {Record<string, any>} description
     */
    _executeWindowAction(description) {
        this.display.setDisplay(ViewAction, description);
    }

    /**
     * @private
     * @param {Record<string, any>} description
     */
    _executeWindowCloseAction(description) {
        notify(`Not implemented action type "${description.type}"`, { type: "danger" });
    }
}
