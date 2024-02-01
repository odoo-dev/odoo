import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Wysiwyg } from "./editor/wysiwyg";

const testHtml = `Hello Phoenix editor!
<p>this is a paragraph</p>
<p>this is another paragraph</p>
<div>this is a div</div>
<p>this is another paragraph</p>
            </div>
`;

export class Playground extends Component {
    static template = "html_editor.Playground";
    static components = { Wysiwyg };
    static props = ["*"];

    setup() {
        this.testHtml = testHtml;
        // this.editor = useWysiwyg("html", { ...defaultConfig });
        this.state = useState({ showWysiwyg: false });
        this.config = useState({
            showToolbar: false,
        });
        this.constructor.components.CurrentWysiwyg = odoo.loader.modules.get(
            "@web_editor/js/wysiwyg/wysiwyg"
        ).Wysiwyg;
    }

    toggleWysiwyg() {
        this.state.showWysiwyg = !this.state.showWysiwyg;
    }
}

registry.category("actions").add("html_editor.playground", Playground);
