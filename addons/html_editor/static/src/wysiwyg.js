import { Component, onMounted, onWillDestroy, useEnv, useRef, useState } from "@odoo/owl";
import { Editor } from "./editor";
import { Toolbar } from "./main/toolbar/toolbar";
import { MAIN_PLUGINS } from "./plugin_sets";

/**
 * @param {HTMLElement} el
 * @param {any} env
 * @param {import("./editor").EditorConfig} [config]
 */
export function wysiwyg(el, env, config = {}) {
    const editor = new Editor(config, env.services);
    editor.attachTo(el);
    return editor;
}

/**
 * @param {string | Function} target
 * @param {import("./editor").EditorConfig} config
 * @returns Editor
 */
export function useWysiwyg(target, config = {}) {
    const env = useEnv();
    const ref = typeof target === "string" ? useRef(target) : null;
    const editor = new Editor(config, env.services);
    onMounted(() => {
        let el = ref ? ref.el : target();
        if (el.tagName === "IFRAME") {
            // grab the inner body instead
            el = ref.el.contentDocument.body;
        }
        editor.attachTo(el);
    });
    onWillDestroy(() => editor.destroy());
    return editor;
}

export class Wysiwyg extends Component {
    static template = "html_editor.Wysiwyg";
    static components = { Toolbar };
    static props = {
        content: { type: String, optional: true },
        class: { type: String, optional: true },
        style: { type: String, optional: true },
        toolbar: { type: Boolean, optional: true },
        iframe: { type: Boolean, optional: true },
        Plugins: { type: Array, optional: true },
        classList: { type: Array, optional: true },
    };

    setup() {
        this.state = useState({
            showToolbar: false,
        });
        this.editor = useWysiwyg("content", {
            innerHTML: this.props.content,
            disableFloatingToolbar: this.props.toolbar,
            classList: this.props.classList,
            Plugins: this.props.Plugins || MAIN_PLUGINS,
        });
        onMounted(() => {
            // now that component is mounted, editor is attached to el, and
            // plugins are started, so we can allow the toolbar to be displayed
            this.state.showToolbar = true;
        });
    }
}
