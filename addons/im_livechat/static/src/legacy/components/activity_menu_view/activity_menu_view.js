/** @odoo-module **/

import { useComponentToModel } from "@im_livechat/legacy/component_hooks/use_component_to_model";
import { registerMessagingComponent } from "@im_livechat/legacy/utils/messaging_component";

import { Component } from "@odoo/owl";

export class ActivityMenuView extends Component {
    /**
     * @override
     */
    setup() {
        super.setup();
        useComponentToModel({ fieldName: "component" });
    }
    /**
     * @returns {ActivityMenuView}
     */
    get activityMenuView() {
        return this.props.record;
    }
}

Object.assign(ActivityMenuView, {
    props: { record: Object },
    template: "im_livechat.ActivityMenuView",
});

registerMessagingComponent(ActivityMenuView);
