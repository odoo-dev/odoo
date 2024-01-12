/** @odoo-module */

export function isEmpty(el) {
    const content = el.innerHTML.trim();
    if (content === "" || content === "<br>") {
        return true;
    }
    return false;
}

export function getCurrentRect() {
    const range = getSelection().getRangeAt(0);
    let rect = range.getBoundingClientRect();
    if (rect.x === 0 && rect.width === 0 && rect.height === 0) {
        const clonedRange = range.cloneRange();
        const shadowCaret = document.createTextNode("|");
        clonedRange.insertNode(shadowCaret);
        clonedRange.selectNode(shadowCaret);
        rect = clonedRange.getBoundingClientRect();
        shadowCaret.remove();
        clonedRange.detach();
    }
    return rect;
}

export function parseHTML(document, html) {
    const fragment = document.createDocumentFragment();
    const parser = new DOMParser();
    const parsedDocument = parser.parseFromString(html, "text/html");
    fragment.replaceChildren(...parsedDocument.body.childNodes);
    return fragment;
}

const blockTagNames = [
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DETAILS",
    "DIALOG",
    "DD",
    "DIV",
    "DL",
    "DT",
    "FIELDSET",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HGROUP",
    "HR",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "UL",
    // The following elements are not in the W3C list, for some reason.
    "SELECT",
    "OPTION",
    "TR",
    "TD",
    "TBODY",
    "THEAD",
    "TH",
];

const computedStyles = new WeakMap();

/**
 * Return true if the given node is a block-level element, false otherwise.
 *
 * @param node
 */
export function isBlock(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }
    const tagName = node.nodeName.toUpperCase();
    if (tagName === "BR") {
        // A <br> is always inline but getComputedStyle(br).display mistakenly
        // returns 'block' if its parent is display:flex (at least on Chrome and
        // Firefox (Linux)). Browsers normally support setting a <br>'s display
        // property to 'none' but any other change is not supported. Therefore
        // it is safe to simply declare that a <br> is never supposed to be a
        // block.
        return false;
    }
    // The node might not be in the DOM, in which case it has no CSS values.
    if (!node.isConnected) {
        return blockTagNames.includes(tagName);
    }
    // We won't call `getComputedStyle` more than once per node.
    let style = computedStyles.get(node);
    if (!style) {
        style = node.ownerDocument.defaultView.getComputedStyle(node);
        computedStyles.set(node, style);
    }
    if (style.display) {
        return !style.display.includes("inline") && style.display !== "contents";
    }
    return blockTagNames.includes(tagName);
}

export function initElementForEdition(element, options = {}) {
    // Detect if the editable base element contain orphan inline nodes. If
    // so we transform the base element HTML to put those orphans inside
    // `<p>` containers.
    const orphanInlineChildNodes = [...element.childNodes].find(
        (n) => !isBlock(n) && (n.nodeType === Node.ELEMENT_NODE || n.textContent.trim() !== "")
    );
    if (orphanInlineChildNodes && !options.allowInlineAtRoot) {
        const childNodes = [...element.childNodes];
        const tempEl = document.createElement("temp-container");
        let currentP = document.createElement("p");
        currentP.style.marginBottom = "0";
        do {
            const node = childNodes.shift();
            const nodeIsBlock = isBlock(node);
            const nodeIsBR = node.nodeName === "BR";
            // Append to the P unless child is block or an unneeded BR.
            if (!(nodeIsBlock || (nodeIsBR && currentP.childNodes.length))) {
                currentP.append(node);
            }
            // Break paragraphs on blocks and BR.
            if (nodeIsBlock || nodeIsBR || childNodes.length === 0) {
                // Ensure we don't add an empty P or a P containing only
                // formating spaces that should not be visible.
                if (currentP.childNodes.length && currentP.innerHTML.trim() !== "") {
                    tempEl.append(currentP);
                }
                currentP = currentP.cloneNode();
                // Append block children directly to the template.
                if (nodeIsBlock) {
                    tempEl.append(node);
                }
            }
        } while (childNodes.length);
        element.replaceChildren(...tempEl.childNodes);
    }
}
