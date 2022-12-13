/* @odoo-module */

import { Component } from "@odoo/owl";

export class ThreadIcon extends Component {
    static props = ["thread", "className?"];
    static template = "mail.thread_icon";
}
