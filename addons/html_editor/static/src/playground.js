/** @odoo-module */
import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useWysiwyg } from "./editor/wysiwyg";

export class Playground extends Component {
    static template = "html_editor.Playground";
    static components = { };
    static props = ["*"];

    setup() {
        this.editor = useWysiwyg("html");
        this.state = useState({ showWysiwyg: false });
        this.constructor.components.Wysiwyg = odoo.loader.modules.get("@web_editor/js/wysiwyg/wysiwyg").Wysiwyg;
    }

    toggleWysiwyg() {
        this.state.showWysiwyg = !this.state.showWysiwyg;
    }
}

registry.category("actions").add("html_editor.playground", Playground);
