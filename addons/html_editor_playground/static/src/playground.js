import { Component, onWillStart, useState, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Wysiwyg } from "@html_editor/wysiwyg";
import { loadBundle } from "@web/core/assets";
import { MAIN_PLUGINS, CORE_PLUGINS, EXTRA_PLUGINS } from "@html_editor/plugin_sets";

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
<p>this is a link: <a>link</a></p>
<p>this is another link: <a>link2</a></p>

`;

const PluginSets = {
    core: CORE_PLUGINS,
    base: MAIN_PLUGINS,
    extras: EXTRA_PLUGINS,
};

class WysiwygLoader extends Component {
    static template = xml`
        <CurrentWysiwyg options="{value: testHtml}" startWysiwyg="startWysiwyg" />
    `;
    static components = { CurrentWysiwyg: null };

    setup() {
        this.testHtml = testHtml;
        onWillStart(async () => {
            await loadBundle("web_editor.backend_assets_wysiwyg");
            this.constructor.components.CurrentWysiwyg = odoo.loader.modules.get(
                "@web_editor/js/wysiwyg/wysiwyg"
            ).Wysiwyg;
        });
    }
}

export class Playground extends Component {
    static template = "html_editor.Playground";
    static components = { Wysiwyg, WysiwygLoader };
    static props = ["*"];

    setup() {
        this.testHtml = testHtml;
        this.state = useState({
            showWysiwyg: false,
        });
        this.config = useState({
            showToolbar: false,
            inIframe: false,
            pluginSet: "base",
        });
    }

    get Plugins() {
        return PluginSets[this.config.pluginSet];
    }

    get classList() {
        return (this.config.pluginSet === "extras") ? ["odoo-editor-qweb"] : [];
    }
}

registry.category("actions").add("html_editor.playground", Playground);
