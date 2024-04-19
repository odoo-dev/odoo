import { expect, getFixture } from "@odoo/hoot";
import { Component, onMounted, useRef, xml } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { useWysiwyg, Wysiwyg } from "@html_editor/wysiwyg";
import { getContent, getSelection, setContent } from "./selection";
import { queryOne } from "@odoo/hoot-dom";

export const Direction = {
    BACKWARD: "BACKWARD",
    FORWARD: "FORWARD",
};

class TestEditor extends Component {
    static template = xml`
        <div class="o-wysiwyg-local-overlay position-relative h-0 w-0" t-ref="localOverlay" />
        <t t-if="props.inIFrame">
            <iframe t-ref="target"/>
        </t>
        <t t-else="">
            <t t-if="props.styleContent">
                <style t-esc="props.styleContent"></style>
            </t>
            <div t-ref="target"/>
        </t>`;
    static props = ["content", "config", "inIFrame", "styleContent?", "onMounted?"];

    setup() {
        this.ref = useRef("target");
        const target = this.props.inIFrame
            ? () => this.ref.el.contentDocument.body.firstChild
            : "target";
        onMounted(() => {
            let el = this.ref.el;
            if (this.props.inIFrame) {
                var html = `<div>${this.props.content || ""}</div><style>${
                    this.props.styleContent
                }</style>`;
                this.ref.el.contentWindow.document.body.innerHTML = html;
                el = target();
            }
            el.setAttribute("contenteditable", true); // so we can focus it if needed
            if (this.props.content) {
                const configSelection = getSelection(el, this.props.content);
                if (configSelection) {
                    el.focus();
                }
                if (this.props.onMounted) {
                    this.props.onMounted?.(el);
                } else {
                    setContent(el, this.props.content);
                }
            }
        });
        const overlayRef = useRef("localOverlay");
        const config = Object.assign(this.props.config, {
            getLocalOverlayContainer: () => overlayRef?.el,
        });
        this.editor = useWysiwyg(target, config, true);
    }
}

/**
 * @typedef { import("@html_editor/editor").Editor } Editor
 *
 * @typedef { Object } TestConfig
 * @property { import("@html_editor/editor").EditorConfig } [config]
 * @property { string } [styleContent]
 * @property { Function } [onMounted]
 * @property { boolean } [inIFrame]
 */

/**
 * @param { string } content
 * @param {TestConfig} [options]
 * @returns { Promise<{el: HTMLElement; editor: Editor; }> }
 */
export async function setupEditor(content, options = {}) {
    const config = options.config || {};
    const inIFrame = "inIFrame" in options ? options.inIFrame : false;
    const styleContent = options.styleContent || "";
    const testEditor = await mountWithCleanup(TestEditor, {
        props: { content, config, inIFrame, styleContent, onMounted: options.onMounted },
        env: options.env,
    });

    return {
        el: testEditor.editor.editable,
        editor: testEditor.editor,
    };
}

/**
 * @typedef { Object } TestEditorConfig
 * @property { string } contentBefore
 * @property { string } [contentBeforeEdit]
 * @property { (editor: Editor) => void } stepFunction
 * @property { string } [contentAfter]
 * @property { string } [contentAfterEdit]
 * @property { string } [compareFunction]
 */

/**
 * TODO maybe we should add "removeCheckIds" and "styleContent" or use setupEditor directly
 * @param {TestEditorConfig & TestConfig} config
 */
export async function testEditor(config) {
    let {
        contentBefore,
        contentBeforeEdit,
        stepFunction,
        contentAfter,
        contentAfterEdit,
        compareFunction,
        inIFrame,
    } = config;
    if (!compareFunction) {
        compareFunction = (content, expected, phase) => {
            expect(content).toBe(expected, {
                message: `(testEditor) ${phase} is strictly equal to %actual%"`,
            });
        };
    }
    const { el, editor } = await setupEditor(contentBefore, config);
    editor.dispatch("HISTORY_STAGE_SELECTION");
    if (inIFrame) {
        expect("iframe").toHaveCount(1);
    }

    if (contentBeforeEdit) {
        // we should do something before (sanitize)
        compareFunction(getContent(el), contentBeforeEdit, "contentBeforeEdit");
    }

    if (stepFunction) {
        await stepFunction(editor);
    }

    if (contentAfterEdit) {
        compareFunction(getContent(el), contentAfterEdit, "contentAfterEdit");
    }
    editor.dispatch("CLEAN", { node: el });
    editor.dispatch("MERGE_ADJACENT_NODE", { node: el });
    if (contentAfter) {
        compareFunction(getContent(el), contentAfter, "contentAfter");
    }
}
/**
 *
 * @param {Object} props
 * @returns { Promise<{el: HTMLElement, wysiwyg: Wysiwyg}> } result
 */
export async function setupWysiwyg(props = {}) {
    const wysiwyg = await mountWithCleanup(Wysiwyg, { props });
    const el = /** @type {HTMLElement} **/ (queryOne(".odoo-editor-editable"));
    if (props.config?.content) {
        // force selection to be put properly
        setContent(el, props.config.content);
    }
    return { wysiwyg, el };
}

export function insertTestHtml(innerHtml) {
    const container = getFixture();
    container.classList.add("odoo-editor-editable");
    container.setAttribute("contenteditable", true);
    container.innerHTML = innerHtml;
    return container.childNodes;
}
