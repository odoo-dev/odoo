import { Component, computed, plugin, Plugin, signal, usePlugins, xml } from "@odoo/owl";
import { ViewPlugin } from "@web_client/view_plugin";
import { viewRegistry } from "@web_client/views/view_registry";
import { notify } from "@web_core/notification/notification_plugin";
import { rpc } from "@web_core/rpc";
import { serviceRegistry } from "@web_core/services";
import { session } from "@web_core/session";
import { actionRegistry } from "./action_registry";

class ActionContainer extends Component {
    static template = xml`<t t-component="this.component()"/>`;

    setup() {
        usePlugins([ViewPlugin]);
        this.view = plugin(ViewPlugin);
        this.component = computed(() => viewRegistry.get(this.view.viewType()));
    }
}

export class ActionPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

    /** @type {import("@odoo/owl").Signal<any>} */
    action = signal(null);

    // action = computed(() => {
    //     const id = this.actionId();
    //     const C = actionRegistry.get(id);
    //     return C;
    // });

    /**
     * @param {string | number} actionId
     */
    async doAction(actionId) {
        if (typeof actionId === "number") {
            const result = await rpc("/web/action/load", {
                action_id: actionId,
                context: session.user_context,
            });
            return this._doAction(result);
        }
    }

    /**
     * @param {import("./menu_plugin").AppMenu} app
     */
    switchApp(app) {
        console.log(app);
        this.doAction(app.actionId);
    }

    /**
     * @private
     */
    async _doAction(actionDescr) {
        switch (actionDescr.type) {
            case "ir.actions.client":
                return this._doClientAction(actionDescr);
            case "ir.actions.act_window":
                return this._doActWindowAction(actionDescr);
        }
    }

    /**
     * @private
     */
    _doClientAction(actionDescr) {
        console.log("client action");
        const actionId = actionDescr.tag;
        const obj = {};
        if (actionRegistry.get(actionId, obj) === obj) {
            notify("Nope, action does not exist");
        } else {
            this.action.set({
                Component: actionRegistry.get(actionId),
            });
        }
    }

    /**
     * @private
     */
    _doActWindowAction(actionDescr) {
        console.log("act window", actionDescr);
        this.action.set({
            Component: ActionContainer,
            description: actionDescr,
        });
    }
}
