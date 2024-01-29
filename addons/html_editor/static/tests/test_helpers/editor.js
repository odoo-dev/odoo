/** @odoo-module */

import { expect, getFixture } from "@odoo/hoot";
import { Component, onMounted, useRef, xml } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { defaultConfig } from "../../src/editor/editor";
import { useWysiwyg } from "../../src/editor/wysiwyg";
import { getContent, setContent } from "./selection";

export const Direction = {
    BACKWARD: "BACKWARD",
    FORWARD: "FORWARD",
};

class TestEditor extends Component {
    static template = xml`<div t-ref="target"/>`;
    static props = ["content", "config"];

    setup() {
        this.ref = useRef("target");
        if (this.props.content) {
            onMounted(() => {
                setContent(this.ref.el, this.props.content);
            });
        }
        this.editor = useWysiwyg("target", { ...defaultConfig, ...this.props.config });
    }
}

export async function setupEditor(content, config = {}) {
    const testEditor = await mountWithCleanup(TestEditor, { props: { content, config } });

    return {
        el: testEditor.ref.el,
        editor: testEditor.editor,
    };
}

// TODO maybe we should add "removeCheckIds" and "styleContent" or use setupEditor directly
export async function testEditor(
    {
        contentBefore,
        contentBeforeEdit,
        stepFunction,
        contentAfter,
        contentAfterEdit,
        compareFunction,
    },
    config = {}
) {
    if (!compareFunction) {
        compareFunction = (content, expected, phase) => {
            expect(content).toBe(expected, {
                message: `(testEditor) ${phase} is strictly equal to %actual%"`,
            });
        };
    }
    const { el, editor } = await setupEditor(contentBefore, config);
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
