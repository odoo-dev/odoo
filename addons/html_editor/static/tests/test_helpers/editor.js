import { expect, getFixture } from "@odoo/hoot";
import { Component, onMounted, useRef, xml } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { useService } from "@web/core/utils/hooks";
import { defaultConfig } from "../../src/editor/editor";
import { useWysiwyg } from "../../src/editor/wysiwyg";
import { getContent, getSelection, setContent } from "./selection";

export const Direction = {
    BACKWARD: "BACKWARD",
    FORWARD: "FORWARD",
};

class TestEditor extends Component {
    static template = xml`
        <t t-if="props.inIFrame">
            <iframe t-ref="target"/>
        </t>
        <t t-else="">
            <div t-ref="target"/>
        </t>`;
    static props = ["content", "config", "inIFrame"];

    setup() {
        this.ref = useRef("target");
        const target = this.props.inIFrame
            ? () => this.ref.el.contentDocument.body.firstChild
            : "target";
        const hotkeyService = useService("hotkey");
        onMounted(() => {
            let el = this.ref.el;
            if (this.props.inIFrame) {
                var html = `<div>${this.props.content || ""}</div>`;
                this.ref.el.contentWindow.document.body.innerHTML = html;
                el = target();
                hotkeyService.registerIframe(this.ref.el);
            }
            el.setAttribute("contenteditable", true); // so we can focus it if needed
            if (this.props.content) {
                const configSelection = getSelection(el, this.props.content);
                if (configSelection) {
                    el.focus();
                }
                setContent(el, this.props.content);
            }
        });
        this.editor = useWysiwyg(target, { ...defaultConfig, ...this.props.config });
    }
}

/**
 * @typedef { Object } TestConfig
 * @property { import("../../src/editor/editor").EditorConfig } [config]
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
    const testEditor = await mountWithCleanup(TestEditor, {
        props: { content, config, inIFrame },
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
 * @property { Function } stepFunction
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

    editor.dispatch("NORMALIZE", el);

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
    editor.dispatch("CLEAN", el);
    // we should clean the editor here
    if (contentAfter) {
        compareFunction(getContent(el), contentAfter, "contentAfter");
    }
}

export function insertTestHtml(innerHtml) {
    const container = getFixture();
    container.classList.add("odoo-editor-editable");
    container.setAttribute("contenteditable", true);
    container.innerHTML = innerHtml;
    return container.childNodes;
}
