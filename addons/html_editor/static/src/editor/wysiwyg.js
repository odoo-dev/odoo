import { Component, onMounted, onWillDestroy, useEnv, useRef, useState } from "@odoo/owl";
import { Editor } from "./editor";
import { Toolbar } from "./toolbar/toolbar";

export function wysiwyg(el, env, config = {}) {
    const editor = new Editor(config, env.services);
    editor.attachTo(el);
    return editor;
}

/**
 * @param {string | Function} target
 * @param {Object} config
 * @returns Editor
 */
export function useWysiwyg(target, config = {}) {
    const env = useEnv();
    const ref = typeof target === "string" ? useRef(target) : null;
    const editor = new Editor(config, env.services);
    onMounted(() => {
        const el = ref ? ref.el : target();
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
    };

    setup() {
        this.state = useState({
            showToolbar: false,
        });
        this.editor = useWysiwyg("content", {
            innerHTML: this.props.content,
            disableFloatingToolbar: this.props.toolbar,
        });
        onMounted(() => {
            // now that component is mounted, editor is attached to el, and
            // plugins are started, so we can allow the toolbar to be displayed
            this.state.showToolbar = true;
        });
    }
}
