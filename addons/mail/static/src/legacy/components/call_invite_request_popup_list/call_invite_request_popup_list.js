/** @odoo-module **/

import { registerMessagingComponent } from "@mail/legacy/utils/messaging_component";

import { Component } from "@odoo/owl";

export class CallInviteRequestPopupList extends Component {}

Object.assign(CallInviteRequestPopupList, {
    props: {},
    template: "mail.CallInviteRequestPopupList",
});

registerMessagingComponent(CallInviteRequestPopupList);
