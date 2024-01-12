/** @odoo-module */

import { useWysiwyg } from "../src/editor/wysiwyg";
import { Component, onMounted, useRef, xml } from "@odoo/owl";
import { mountWithCleanup } from "@web/../tests/web_test_helpers";

export function getContent(node) {
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    return [...node.childNodes].map((childNode) => _getContent(childNode, range)).join("");
}

function _getContent(node, range) {
    switch (node.nodeType) {
        case Node.TEXT_NODE:
            return getTextContent(node, range);
        case Node.ELEMENT_NODE:
            return getElemContent(node, range);
        default:
            throw new Error("boom");
    }
}

function getTextContent(node, range) {
    let text = node.textContent;
    if (range.endContainer === node) {
        text = text.slice(0, range.endOffset) + "]" + text.slice(range.endOffset);
    }
    if (range.startContainer === node) {
        text = text.slice(0, range.startOffset) + "[" + text.slice(range.startOffset);
    }
    return text;
}

const VOID_ELEMS = new Set(["BR", "IMG", "INPUT"]);

function getElemContent(el, range) {
    const tag = el.tagName.toLowerCase();
    let attrs = [];
    for (let attr of el.attributes) {
        attrs.push(`${attr.name}="${attr.value}"`);
    }
    const attrStr = (attrs.length ? " " : "") + attrs.join(" ");
    let result = `<${tag + attrStr}>`;
    if (range.startContainer === el) {
        result += "[";
    }
    if (range.endContainer === el) {
        result += "]";
    }
    for (let child of el.childNodes) {
        result += _getContent(child, range);
    }
    if (!VOID_ELEMS.has(el.tagName)) {
        result += `</${tag}>`;
    }
    return result;
}

export function setContent(el, content) {
    const rawContent = content.replace("[", "").replace("]", "");
    el.innerHTML = rawContent;
    setRange(el, content);
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

function visitAndSetRange(target, ref, range) {
    function applyRange() {
        let offset = 0;
        const text = ref.textContent;
        if (text.includes("[")) {
            offset = 1;
            const index = text.indexOf("[");
            range.setStart(target, index);
        }
        if (text.includes("]")) {
            const index = text.indexOf("]") - offset;
            range.setEnd(target, index);
        }
    }

    if (target.nodeType === Node.TEXT_NODE) {
        applyRange();
    } else {
        const targetChildren = [...target.childNodes];
        const refChildren = [...ref.childNodes];
        if (targetChildren.length === 0 && refChildren.length === 1) {
            applyRange();
            return;
        }
        for (let i = 0; i < targetChildren.length; i++) {
            visitAndSetRange(targetChildren[i], refChildren[i], range);
        }
    }
}

class TestEditor extends Component {
    static template = xml`<div t-ref="target"/>`;

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
