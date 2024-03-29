import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Wysiwyg } from "@html_editor/wysiwyg";
import { loadBundle } from "@web/core/assets";
import { BASE_PLUGINS, CORE_PLUGINS, EXTRA_PLUGINS } from "@html_editor/plugin_sets";

const testHtml = `Hello Phoenix editor!
<p>this is a paragraph</p>
<p><em>this is another paragraph</em></p>
<div>this is a div</div>
<table class="table table-bordered">
    <tbody>
        <tr><td>1</td><td>2</td><td>3</td></tr>
        <tr><td>4</td><td>5</td><td>6</td></tr>
    </tbody>
</table>
<p>this is another paragraph</p>
<div>
    <t t-if="test">
        QWeb Hello
        <t t-if="sub-test">Sub If</t>
        <t t-else="">Sub else</t>
    </t>
    <t t-elif="test2">Hi</t>
    <t t-else="">By</t>
</div>
<div>
    <t t-out="test">T-Out</t>
    <t t-esc="test">T-esc</t>
    <t t-esc="test">T-field</t>
</div>

`;

const PluginSets = {
    core: CORE_PLUGINS,
    base: BASE_PLUGINS,
    extras: EXTRA_PLUGINS,
};

export class Playground extends Component {
    static template = "html_editor.Playground";
    static components = { Wysiwyg };
    static props = ["*"];

    setup() {
        this.testHtml = testHtml;
        // this.editor = useWysiwyg("html", { ...defaultConfig });
        this.state = useState({
            showWysiwyg: false,
        });
        this.config = useState({
            showToolbar: false,
            inIframe: false,
            pluginSet: "base",
        });
        onWillStart(async () => {
            await loadBundle("web_editor.backend_assets_wysiwyg");
        this.constructor.components.CurrentWysiwyg = odoo.loader.modules.get(
            "@web_editor/js/wysiwyg/wysiwyg"
        ).Wysiwyg;
        })
    }

    get Plugins() {
        return PluginSets[this.config.pluginSet];
    }

    get classListEditor() {
        const classList = [];
        if (this.config.hasQWebPlugin) {
            classList.push("odoo-editor-qweb");
        }
        return classList;
    }

    toggleWysiwyg() {
        this.state.showWysiwyg = !this.state.showWysiwyg;
    }
}

registry.category("actions").add("html_editor.playground", Playground);
