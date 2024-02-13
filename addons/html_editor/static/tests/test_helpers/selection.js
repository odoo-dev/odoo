export function getContent(node) {
    const selection = node.ownerDocument.getSelection();
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
    let text = node.textContent.replace(/\u00a0/g, "&nbsp;");
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
    const selection = anchorNode.ownerDocument.getSelection();
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
        const text = ref.textContent;
        if (text.includes("[")) {
            const index = text.replace("]", "").indexOf("[");
            configSelection.anchorNode = target;
            configSelection.anchorOffset = index;
        }
        if (text.includes("]")) {
            const index = text.replace("[", "").indexOf("]");
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
