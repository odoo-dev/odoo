/* @odoo-module */

import { Component } from "@odoo/owl";
import { ThreadPublic } from "./thread_public";

export class DiscussPublic extends Component {
    static components = { ThreadPublic };
    static props = ["data"];
    static template = "mail.discuss_public";
}
