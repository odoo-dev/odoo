import { Component, onWillStart, useState, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { Wysiwyg } from "@html_editor/wysiwyg";
import { loadBundle } from "@web/core/assets";
import { MAIN_PLUGINS, CORE_PLUGINS, EXTRA_PLUGINS } from "@html_editor/plugin_sets";
import { counter } from "./counter";
import { card } from "./card";

const testHtml = `Hello Phoenix editor!
<p>this is a paragraph</p>
<p><em>this is another paragraph</em></p>
<p>Embedded element here (with all plugins)
<span data-embedded="counter" data-count="1"/>
</p>
<div>this is a div</div>
<table class="table table-bordered">
    <tbody>
        <tr><td>1</td><td>2</td><td>3</td></tr>
        <tr><td>4</td><td>5</td><td>6</td></tr>
    </tbody>
</table>
<p><font style="color: rgb(30, 125, 30);">this is another paragraph with color</font></p>
<p><font style="color: rgb(125, 125, 0);">this is another paragraph with color 2</font></p>
<p><font style="background: rgb(247, 173, 107);">this is another paragraph with background color</font></p>
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
<p>this is a link: <a href="http://test.com">link</a></p>
<p>this is another link: <a>link2</a></p>
<div data-embedded="card" data-title="Some Title">
    <p>Some quick example text to build on the card title and make up the bulk of the card's content.</p>
</div>
<p>
Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.
</p>
`;

const PluginSets = {
    core: CORE_PLUGINS,
    base: MAIN_PLUGINS,
    extras: EXTRA_PLUGINS,
};

class WysiwygLoader extends Component {
    static template = xml`
        <CurrentWysiwyg options="this.wysiwygOptions" startWysiwyg="startWysiwyg" />
    `;
    static components = { CurrentWysiwyg: null };

    setup() {
        this.wysiwygOptions = {
            value: testHtml,
            editorPlugins: [],
        };
        onWillStart(async () => {
            await loadBundle("web_editor.backend_assets_wysiwyg");
            WysiwygLoader.components.CurrentWysiwyg = odoo.loader.modules.get(
                "@web_editor/js/wysiwyg/wysiwyg"
            ).Wysiwyg;
            const MoveNodePlugin = odoo.loader.modules.get(
                "@web_editor/js/wysiwyg/MoveNodePlugin"
            ).MoveNodePlugin;
            this.wysiwygOptions.editorPlugins = [MoveNodePlugin];
        });
    }
}

export class Playground extends Component {
    static template = "html_editor.Playground";
    static components = { Wysiwyg, WysiwygLoader };
    static props = ["*"];

    setup() {
        this.state = useState({
            showWysiwyg: false,
        });
        this.config = useState({
            showToolbar: false,
            inIframe: false,
            pluginSet: "base",
        });
    }

    getConfig() {
        return {
            content: testHtml,
            Plugins: PluginSets[this.config.pluginSet],
            classList: this.classList,
            resources: {
                inlineComponents: [counter, card],
            },
        };
    }

    get classList() {
        return this.config.pluginSet === "extras" ? ["odoo-editor-qweb"] : [];
    }
}

registry.category("actions").add("html_editor.playground", Playground);
