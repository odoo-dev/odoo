/** @odoo-module **/

import { registerMessagingComponent } from "@mail/legacy/utils/messaging_component";

import { Component } from "@odoo/owl";

export class CallSettingsMenuDevice extends Component {}

Object.assign(CallSettingsMenuDevice, {
    props: { device: Object },
    template: "mail.CallSettingsMenuDevice",
});

registerMessagingComponent(CallSettingsMenuDevice);
