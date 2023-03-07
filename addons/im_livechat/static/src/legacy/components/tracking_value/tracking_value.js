/** @odoo-module **/

import { registerMessagingComponent } from "@im_livechat/legacy/utils/messaging_component";

import { Component } from "@odoo/owl";

export class TrackingValue extends Component {
    /**
     * @returns {TrackingValue}
     */
    get trackingValue() {
        return this.props.value;
    }
}

Object.assign(TrackingValue, {
    props: { value: Object },
    template: "im_livechat.TrackingValue",
});

registerMessagingComponent(TrackingValue);
