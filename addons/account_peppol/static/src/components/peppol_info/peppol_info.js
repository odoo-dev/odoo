/** @odoo-module **/
import { Component, usePlugin, useProps } from "@odoo/owl";
import { registry } from "@web/core/registry";
import {_t} from "@web/core/l10n/translation";
import { ActionPlugin, standardActionServiceProps } from "@web/webclient/actions/action_plugin";


export class WhatIsPeppol extends Component {
    static template = "account_peppol.WhatIsPeppol";

    props = useProps(standardActionServiceProps);

    setup() {
        super.setup();
        this.actionService = usePlugin(ActionPlugin);
    }

    get shouldRegisterOnClose() {
        return this.props.action.context.action_on_activate.res_model === "peppol.registration";
    }

    closeButtonLabel() {
        if (this.shouldRegisterOnClose) {
            return _t("Activate")
        } else {
            return _t("Got it !")
        }
    }

    activate() {
        const action = this.props.action.context.action_on_activate;
        this.actionService.doAction({
            name: action.name,
            type: action.type,
            res_model: action.res_model,
            views: [[false, action.view_mode]],
            target: action.target,
            context: action.context,
        });
    }
}

registry.category("actions").add("account_peppol.what_is_peppol", WhatIsPeppol);
