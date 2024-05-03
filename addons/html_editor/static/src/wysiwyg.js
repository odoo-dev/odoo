import { Component, onMounted, onWillDestroy, useComponent, useRef, useState } from "@odoo/owl";
import { Editor } from "./editor";
import { Toolbar } from "./main/toolbar/toolbar";

/**
 * @typedef { import("./editor").EditorConfig } EditorConfig
 **/

function copyCssRules(sourceDoc, targetDoc) {
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
 * @param {EditorConfig} config
 * @returns Editor
 */
export function useWysiwyg(target, config = {}, copyCss = false) {
    const comp = useComponent();
    const env = comp.env;
    /** @type { EditorConfig } */
    const _config = Object.assign(Object.create(config), {
        // grab app and env for inline component plugin, if needed
        inlineComponentInfo: { app: comp.__owl__.app, env },
    });
    const editor = new Editor(_config, env.services);

    const ref = typeof target === "string" ? useRef(target) : null;
    onMounted(() => {
        const el = typeof target === "string" ? ref.el : target();
        if (el.tagName === "IFRAME") {
            // grab the inner body instead
            const attachEditor = () => {
                if (!editor.isDestroyed) {
                    if (copyCss) {
                        copyCssRules(document, el.contentDocument);
                    }
                    const additionalClasses = el.dataset.class?.split(" ");
                    for (const c of additionalClasses) {
                        el.contentDocument.body.classList.add(c);
                    }
                    editor.attachTo(el.contentDocument.body);
                }
            };
            if (el.contentDocument.readyState === "complete") {
                attachEditor();
            } else {
                // in firefox, iframe is not immediately available. we need to wait
                // for it to be ready before mounting editor
                el.addEventListener(
                    "load",
                    () => {
                        attachEditor();
                        comp.render();
                    },
                    { once: true }
                );
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
        config: { type: Object, optional: true },
        class: { type: String, optional: true },
        style: { type: String, optional: true },
        toolbar: { type: Boolean, optional: true },
        iframe: { type: Boolean, optional: true },
        copyCss: { type: Boolean, optional: true },
    };

    setup() {
        this.state = useState({
            showToolbar: false,
        });
        const overlayRef = useRef("localOverlay");
        const config = Object.assign(this.props.config || {}, {
            getLocalOverlayContainer: () => overlayRef?.el,
            disableFloatingToolbar: this.props.toolbar,
        });
        this.editor = useWysiwyg("content", config, this.props.copyCss);

        onMounted(() => {
            // now that component is mounted, editor is attached to el, and
            // plugins are started, so we can allow the toolbar to be displayed
            this.state.showToolbar = true;
        });
    }
}
