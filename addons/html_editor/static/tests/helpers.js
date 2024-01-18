/** @odoo-module */

import { expect } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { Component, onMounted, useRef, xml } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { useWysiwyg } from "../src/editor/wysiwyg";

export const Direction = {
    BACKWARD: "BACKWARD",
    FORWARD: "FORWARD",
};

export function getContent(node) {
    const selection = window.getSelection();
    return [...node.childNodes].map((childNode) => _getContent(childNode, selection)).join("");
}

function _getContent(node, selection) {
    switch (node.nodeType) {
        case Node.TEXT_NODE:
            return getTextContent(node, selection);
        case Node.ELEMENT_NODE:
            return getElemContent(node, selection);
        default:
            throw new Error("boom");
    }
}

function getTextContent(node, selection) {
    let text = node.textContent;
    if (selection.focusNode === node) {
        text = text.slice(0, selection.focusOffset) + "]" + text.slice(selection.focusOffset);
    }
    if (selection.anchorNode === node) {
        text = text.slice(0, selection.anchorOffset) + "[" + text.slice(selection.anchorOffset);
    }
    return text;
}

const VOID_ELEMS = new Set(["BR", "IMG", "INPUT"]);

function getElemContent(el, selection) {
    const tag = el.tagName.toLowerCase();
    const attrs = [];
    for (const attr of el.attributes) {
        attrs.push(`${attr.name}="${attr.value}"`);
    }
    const attrStr = (attrs.length ? " " : "") + attrs.join(" ");
    let result = `<${tag + attrStr}>`;
    if (selection.anchorNode === el) {
        result += "[";
    }
    if (selection.focusNode === el) {
        result += "]";
    }
    for (const child of el.childNodes) {
        result += _getContent(child, selection);
    }
    if (!VOID_ELEMS.has(el.tagName)) {
        result += `</${tag}>`;
    }
    return result;
}

export function setContent(el, content) {
    const rawContent = content.replace("[", "").replace("]", "");
    el.innerHTML = rawContent;

    const configSelection = getSelection(el, content);
    if (configSelection) {
        setSelection(configSelection);
    }
}

export function setSelection({ anchorNode, anchorOffset, focusNode, focusOffset }) {
    const selection = document.getSelection();
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
}

export function getSelection(el, content) {
    if (content.indexOf("[") === -1 || content.indexOf("]") === -1) {
        return;
    }

    // sanity check
    const rawContent = content.replace("[", "").replace("]", "");
    if (el.innerHTML !== rawContent) {
        throw new Error("setRange requires the same html content");
    }

    const elRef = document.createElement(el.tagName);
    elRef.innerHTML = content;

    const configSelection = {};
    visitAndSetRange(el, elRef, configSelection);

    if (configSelection.anchorNode === undefined || configSelection.focusNode === undefined) {
        return;
    }
    return configSelection;
}

export function setRange(el, content) {
    // sanity check
    const rawContent = content.replace("[", "").replace("]", "");
    if (el.innerHTML !== rawContent) {
        throw new Error("setRange requires the same html content");
    }

    // create range
    const range = document.createRange();
    const elRef = document.createElement(el.tagName);
    elRef.innerHTML = content;

    visitAndSetRange(el, elRef, range);

    // set selection range
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function visitAndSetRange(target, ref, configSelection) {
    function applyRange() {
        let offset = 0;
        const text = ref.textContent;
        if (text.includes("[")) {
            offset = 1;
            const index = text.indexOf("[");
            configSelection.anchorNode = target;
            configSelection.anchorOffset = index;
        }
        if (text.includes("]")) {
            const index = text.indexOf("]") - offset;
            configSelection.focusNode = target;
            configSelection.focusOffset = index;
        }
    }

    if (target.nodeType === Node.TEXT_NODE) {
        applyRange();
    } else {
        const targetChildren = [...target.childNodes];
        const refChildren = [...ref.childNodes];
        if (targetChildren.length !== refChildren.length) {
            applyRange();
            return;
        }
        for (let i = 0; i < targetChildren.length; i++) {
            visitAndSetRange(targetChildren[i], refChildren[i], configSelection);
        }
    }
}

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
        this.editor = useWysiwyg("target", this.props.config);
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
    { contentBefore, contentBeforeEdit, stepFunction, contentAfter, contentAfterEdit },
    config = {}
) {
    const { el, editor } = await setupEditor(contentBefore, config);
    if (contentBeforeEdit) {
        // we should do something before (sanitize)
        expect(getContent(el)).toBe(contentBeforeEdit);
    }

    if (stepFunction) {
        await stepFunction(editor);
    }

    if (contentAfterEdit) {
        expect(getContent(el)).toBe(contentAfterEdit);
    }
    editor.dispatch("CLEAN", el);
    // we should clean the editor here
    if (contentAfter) {
        expect(getContent(el)).toBe(contentAfter);
    }
}

export async function insertText(editor, text) {
    // Create and dispatch events to mock text insertion. Unfortunatly, the
    // events will be flagged `isTrusted: false` by the browser, requiring
    // the editor to detect them since they would not trigger the default
    // browser behavior otherwise.
    for (const char of text) {
        // KeyDownEvent is required to trigger deleteRange.
        dispatch(editor.editable, "keydown", { key: char });
        // KeyPressEvent is not required but is triggered like in the browser.
        dispatch(editor.editable, "keypress", { key: char });
        // InputEvent is required to simulate the insert text.
        dispatch(editor.editable, "input", {
            inputType: "insertText",
            data: char,
        });
        // KeyUpEvent is not required but is triggered like the browser would.
        dispatch(editor.editable, "keyup", { key: char });
    }
}

export async function deleteForward(editor) {
    const selection = document.getSelection();
    if (selection.isCollapsed) {
        throw new Error("replace by new command for oDeleteForward");
        // editor.dispatch("xxx");
    } else {
        // Better representation of what happened in the editor when the user
        // presses the delete key.
        await dispatch(editor.editable, "keydown", { key: "Delete" });
        editor.document.execCommand("delete");
    }
}

export async function deleteBackward(editor, isMobileTest = false) {
    // TODO phoenix: find a strategy for test mobile and desktop. (check legacy code)

    const selection = document.getSelection();
    if (selection.isCollapsed) {
        editor.execCommand("oDeleteBackward");
        throw new Error("replace by new command for oDeleteBackward");
        // editor.dispatch("xxx");
    } else {
        // Better representation of what happened in the editor when the user
        // presses the backspace key.
        await dispatch(editor.editable, "keydown", { key: "Backspace" });
        editor.document.execCommand("delete");
    }
}

// history
export function undo(editor) {
    throw new Error("Not implemented command to replace historyUndo");
}

export function redo(editor) {
    throw new Error("Not implemented command to replace historyRedo");
}

export function click(el, options) {
    throw new Error("need a proper implementation");
}
