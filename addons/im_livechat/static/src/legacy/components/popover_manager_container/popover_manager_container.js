/** @odoo-module **/

import { useMessagingContainer } from "@im_livechat/legacy/component_hooks/use_messaging_container";

import { Component } from "@odoo/owl";

export class PopoverManagerContainer extends Component {
    /**
     * @override
     */
    setup() {
        useMessagingContainer();
    }

    get messaging() {
        return this.env.services.messaging.modelManager.messaging;
    }
}
PopoverManagerContainer.props = {};

Object.assign(PopoverManagerContainer, {
    template: "im_livechat.PopoverManagerContainer",
});
