import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { cursorState } from "./show_me";

/**
 * The cursor (or finger, on touch screens) that "Show me" moves on the
 * learner's screen. While it plays, the page cannot be clicked.
 */
export class ShowMeCursor extends Component {
    static template = "learning.ShowMeCursor";

    setup() {
        this.cursor = cursorState;
    }

    get style() {
        return `transform: translate(${this.cursor.x}px, ${this.cursor.y}px);`;
    }
}

registry.category("main_components").add("learning.ShowMeCursor", { Component: ShowMeCursor });
