import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Wysiwyg } from "./editor/wysiwyg";

const testHtml = `Hello Phoenix editor!
<p>this is a paragraph</p>
<p><em>this is another paragraph</em></p>
<div>this is a div</div>
<table class="table table-bordered">
    <tbody>
        <tr><td>1</td><td>2</td><td></td></tr>
    </tbody>
</table>
<p>this is another paragraph</p>

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
            inIframe: false,
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
