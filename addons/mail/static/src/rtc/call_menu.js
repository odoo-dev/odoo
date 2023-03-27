/* @odoo-module */

import { useRtc } from "@mail/rtc/rtc_hook";

import { Component } from "@odoo/owl";

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class CallMenu extends Component {
    static props = [];
    static template = "mail.CallMenu";
    setup() {
        this.services = {
            "mail.thread": useService("mail.thread"),
            "mail.rtc": useRtc(),
        };
    }
}

registry.category("systray").add("mail.CallMenu", { Component: CallMenu }, { sequence: 100 });
