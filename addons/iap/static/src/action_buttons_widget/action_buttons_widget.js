import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Component, usePlugin } from "@odoo/owl";
import { ActionPlugin } from "@web/webclient/actions/action_plugin";

class IAPActionButtonsWidget extends Component {
    static template = "iap.ActionButtonsWidget";

    setup() {
        this.orm = useService("orm");
        this.action = usePlugin(ActionPlugin);
    }

    async onViewServicesClicked() {
        const action = await this.orm.call("iap.account", "action_view_my_services");
        this.action.doAction(action);
    }
}

export const iapActionButtonsWidget = {
    component: IAPActionButtonsWidget,
};
registry.category("view_widgets").add("iap_view_my_services", iapActionButtonsWidget);
