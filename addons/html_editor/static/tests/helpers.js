/** @odoo-module */

import { expect, getFixture } from "@odoo/hoot";
import { dispatch } from "@odoo/hoot-dom";
import { Component, onMounted, useRef, xml } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";
import { defaultConfig } from "../src/editor/editor";
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

    function addTextSelection() {
        if (selection.anchorNode === el && index === selection.anchorOffset) {
            result += "[";
        }
        if (selection.focusNode === el && index === selection.focusOffset) {
            result += "]";
        }
    }
    let index = 0;
    for (const child of el.childNodes) {
        addTextSelection();
        result += _getContent(child, selection);
        index++;
    }
    addTextSelection();
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
    { contentBefore, contentBeforeEdit, stepFunction, contentAfter, contentAfterEdit },
    config = {}
) {
    const { el, editor } = await setupEditor(contentBefore, config);
    if (contentBeforeEdit) {
        // we should do something before (sanitize)
        expect(getContent(el)).toBe(contentBeforeEdit, {
            message: "(testEditor) contentBeforeEdit is strictly equal to %actual%",
        });
    }

    if (stepFunction) {
        await stepFunction(editor);
    }

    if (contentAfterEdit) {
        expect(getContent(el)).toBe(contentAfterEdit, {
            message: "(testEditor) contentAfterEdit is strictly equal to %actual%",
        });
    }
    editor.dispatch("CLEAN", el);
    // we should clean the editor here
    if (contentAfter) {
        expect(getContent(el)).toBe(contentAfter, {
            message: "(testEditor) contentAfter is strictly equal to %actual%",
        });
    }
}

export async function insertText(editor, text) {
    // Create and dispatch events to mock text insertion. Unfortunatly, the
    // events will be flagged `isTrusted: false` by the browser, requiring
    // the editor to detect them since they would not trigger the default
    // browser behavior otherwise.
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    if (!range.collapsed) {
        throw new Error("need to implement something... maybe");
    }
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
        const txt = document.createTextNode("");
        range.startContainer.appendChild(txt);
        range.insertNode(txt);
        setSelection({ anchorNode: txt, anchorOffset: 0, focusNode: txt, focusOffset: 0 });
    }
    const node = range.startContainer;
    let offset = range.startOffset;
    const insertChar = (char) => {
        node.textContent =
            node.textContent.slice(0, offset) + char + node.textContent.slice(offset);
        offset++;
        range.setStart(node, offset);
        range.setEnd(node, offset);
    };
    for (const char of text) {
        // KeyDownEvent is required to trigger deleteRange.
        dispatch(editor.editable, "keydown", { key: char });
        // KeyPressEvent is not required but is triggered like in the browser.
        dispatch(editor.editable, "keypress", { key: char });
        // InputEvent is required to simulate the insert text.
        insertChar(char);
        dispatch(editor.editable, "input", {
            inputType: "insertText",
            data: char,
        });
        // KeyUpEvent is not required but is triggered like the browser would.
        dispatch(editor.editable, "keyup", { key: char });
    }
}

export async function deleteForward(editor) {
    editor.dispatch("DELETE_FORWARD");
}

export async function deleteBackward(editor, isMobileTest = false) {
    // TODO phoenix: find a strategy for test mobile and desktop. (check legacy code)

    editor.dispatch("DELETE_BACKWARD");
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

// list
export function toggleOrderedList(editor) {
    editor.dispatch("TOGGLE_LIST", { type: "OL" });
}

export function toggleUnorderedList(editor) {
    editor.dispatch("TOGGLE_LIST", { type: "UL" });
}

export function toggleCheckList(editor) {
    editor.dispatch("TOGGLE_LIST", { type: "CL" });
}

export function insertTestHtml(innerHtml) {
    const container = getFixture();
    container.classList.add("odoo-editor-editable");
    container.setAttribute("contenteditable", true);
    container.innerHTML = innerHtml;
    return container.childNodes;
}
