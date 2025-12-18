import { Component, plugin, Plugin, signal, usePlugins, xml } from "@odoo/owl";
import { ViewPlugin } from "@web_client/view_plugin";
import { KanbanView } from "@web_client/views/kanban_view";
import { ListView } from "@web_client/views/list_view";
import { notify } from "@web_core/notification/notification_plugin";
import { rpc } from "@web_core/rpc";
import { serviceRegistry } from "@web_core/services";
import { session } from "@web_core/session";
import { actionRegistry } from "./action_registry";

class ActionContainer extends Component {
    static template = xml`
        <div>
            <h1>
                <t t-out="this.action.action().description.display_name"/>
            </h1>
            <t t-if="this.view.viewType() === 'list'">
                <ListView/>
            </t>
            <t t-elif="this.view.viewType() === 'kanban'">
                <KanbanView/>
            </t>
        </div>
    `;
    static components = { ListView, KanbanView };
    action = plugin(ActionPlugin);

    setup() {
        usePlugins([ViewPlugin]);
        this.view = plugin(ViewPlugin);
    }
}

export class ActionPlugin extends Plugin {
    static id = this.name;
    static {
        serviceRegistry.addById(this);
    }

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
     * 
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
        const obj = {}
        if (actionRegistry.get(actionId, obj) === obj) {
            notify("Nope, action does not exist");
        } else {
            this.action.set({
                Component: actionRegistry.get(actionId)
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
        })
    }
}
