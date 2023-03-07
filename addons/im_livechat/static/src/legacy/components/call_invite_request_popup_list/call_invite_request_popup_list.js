/** @odoo-module **/

import { registerMessagingComponent } from "@im_livechat/legacy/utils/messaging_component";

import { Component } from "@odoo/owl";

export class CallInviteRequestPopupList extends Component {}

Object.assign(CallInviteRequestPopupList, {
    props: {},
    template: "im_livechat.CallInviteRequestPopupList",
});

registerMessagingComponent(CallInviteRequestPopupList);
