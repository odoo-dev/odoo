import { Component, onMounted, onWillDestroy, useComponent, useRef, useState } from "@odoo/owl";
import { Editor } from "./editor";
import { Toolbar } from "./main/toolbar/toolbar";
import { MAIN_PLUGINS } from "./plugin_sets";

function copyCss(sourceDoc, targetDoc) {
    for (const sheet of sourceDoc.styleSheets) {
        const rules = [];
        for (const r of sheet.cssRules) {
            rules.push(r.cssText);
        }
        const cssRules = rules.join(" ");
        const styleTag = targetDoc.createElement("style");
        styleTag.appendChild(targetDoc.createTextNode(cssRules));
        targetDoc.head.appendChild(styleTag);
    }
}

/**
 * @param {string | Function} target
 * @param {import("./editor").EditorConfig} config
 * @returns Editor
 */
export function useWysiwyg(target, localOverlayRefName, config = {}) {
    const comp = useComponent();
    const env = comp.env;
    // grab app and env for inline component plugin, if needed
    config.inlineComponentInfo = {
        app: comp.__owl__.app,
        env,
    };
    const ref = typeof target === "string" ? useRef(target) : null;
    const localOverlaContainerRef = localOverlayRefName && useRef(localOverlayRefName);
    const _config = Object.create(config);
    _config.getLocalOverlayContainer = () => localOverlaContainerRef?.el;
    const editor = new Editor(_config, env.services);
    onMounted(() => {
        const el = ref ? ref.el : target();
        if (el.tagName === "IFRAME") {
            // grab the inner body instead
            const attachEditor = () => {
                if (!editor.isDestroyed) {
                    if (config.copyCss) {
                        copyCss(document, el.contentDocument);
                    }
                    editor.attachTo(el.contentDocument.body);
                }
            };
            if (el.contentDocument.readyState === "complete") {
                attachEditor();
            } else {
                // in firefox, iframe is not immediately available. we need to wait
                // for it to be ready before mounting editor
                el.addEventListener("load", attachEditor, { once: true });
            }
        } else {
            editor.attachTo(el);
        }
    });
    onWillDestroy(() => editor.destroy(true));
    return editor;
}

export class Wysiwyg extends Component {
    static template = "html_editor.Wysiwyg";
    static components = { Toolbar };
    static props = {
        content: { type: String, optional: true },
        class: { type: String, optional: true },
        style: { type: String, optional: true },
        localOverlay: { type: Boolean, optional: true },
        toolbar: { type: Boolean, optional: true },
        iframe: { type: Boolean, optional: true },
        copyCss: { type: Boolean, optional: true },
        Plugins: { type: Array, optional: true },
        classList: { type: Array, optional: true },
        inlineComponents: { type: Array, optional: true },
    };

    setup() {
        this.state = useState({
            showToolbar: false,
        });
        this.editor = useWysiwyg("content", "localOverlay", {
            innerHTML: this.props.content,
            disableFloatingToolbar: this.props.toolbar,
            classList: this.props.classList,
            copyCss: this.props.copyCss,
            Plugins: this.props.Plugins || MAIN_PLUGINS,
            inlineComponents: this.props.inlineComponents || [],
        });
        onMounted(() => {
            // now that component is mounted, editor is attached to el, and
            // plugins are started, so we can allow the toolbar to be displayed
            this.state.showToolbar = true;
        });
    }
}
