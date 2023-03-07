/** @odoo-module **/

// ensure components are registered beforehand.
import "@im_livechat/legacy/components/activity_menu_view/activity_menu_view";
import { getMessagingComponent } from "@im_livechat/legacy/utils/messaging_component";

import { Component } from "@odoo/owl";

export class ActivityMenuContainer extends Component {
    /**
     * @override
     */
    setup() {
        super.setup();
        this.env.services.messaging.modelManager.messagingCreatedPromise.then(() => {
            this.activityMenuView =
                this.env.services.messaging.modelManager.messaging.models[
                    "ActivityMenuView"
                ].insert();
            this.render();
        });
    }
}
ActivityMenuContainer.props = {};

Object.assign(ActivityMenuContainer, {
    components: { ActivityMenuView: getMessagingComponent("ActivityMenuView") },
    template: "im_livechat.ActivityMenuContainer",
});
