/** @odoo-module **/

import { registerMessagingComponent } from "@im_livechat/legacy/utils/messaging_component";

import { Component } from "@odoo/owl";

export class CallSettingsMenuDevice extends Component {}

Object.assign(CallSettingsMenuDevice, {
    props: { device: Object },
    template: "im_livechat.CallSettingsMenuDevice",
});

registerMessagingComponent(CallSettingsMenuDevice);
