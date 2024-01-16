/** @odoo-module */

import { closestBlock, isBlock } from "./blocks";
import { closestElement } from "./dom_traversal";

/**
 * Return true if the given node appears bold. The node is considered to appear
 * bold if its font weight is bigger than 500 (eg.: Heading 1), or if its font
 * weight is bigger than that of its closest block.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isBold(node) {
    const fontWeight = +getComputedStyle(closestElement(node)).fontWeight;
    return fontWeight > 500 || fontWeight > +getComputedStyle(closestBlock(node)).fontWeight;
}

/**
 * Return true if the given node appears italic.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isItalic(node) {
    return getComputedStyle(closestElement(node)).fontStyle === "italic";
}

/**
 * Return true if the given node appears underlined.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isUnderline(node) {
    let parent = closestElement(node);
    while (parent) {
        if (getComputedStyle(parent).textDecorationLine.includes("underline")) {
            return true;
        }
        parent = parent.parentElement;
    }
    return false;
}

/**
 * Return true if the given node appears struck through.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isStrikeThrough(node) {
    let parent = closestElement(node);
    while (parent) {
        if (getComputedStyle(parent).textDecorationLine.includes("line-through")) {
            return true;
        }
        parent = parent.parentElement;
    }
    return false;
}

/**
 * Return true if the given node font-size is equal to `props.size`.
 *
 * @param {Object} props
 * @param {Node} props.node A node to compare the font-size against.
 * @param {String} props.size The font-size value of the node that will be
 *     checked against.
 * @returns {boolean}
 */
export function isFontSize(node, props) {
    const element = closestElement(node);
    return getComputedStyle(element)["font-size"] === props.size;
}

/**
 * Return true if the given node classlist contains `props.className`.
 *
 * @param {Object} props
 * @param {Node} node A node to compare the font-size against.
 * @param {String} props.className The name of the class.
 * @returns {boolean}
 */
export function hasClass(node, props) {
    const element = closestElement(node);
    return element.classList.contains(props.className);
}

/**
 * Return true if the given node appears in a different direction than that of
 * the editable ('ltr' or 'rtl').
 *
 * Note: The direction of the editable is set on its "dir" attribute, to the
 * value of the "direction" option on instantiation of the editor.
 *
 * @param {Node} node
 * @param {Element} editable
 * @returns {boolean}
 */
export function isDirectionSwitched(node, editable) {
    const defaultDirection = editable.getAttribute("dir");
    return getComputedStyle(closestElement(node)).direction !== defaultDirection;
}

export function isZWS(node) {
    return node && node.textContent === "\u200B";
}

/**
 * Returns true if the given node is in a PRE context for whitespace handling.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isInPre(node) {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return (
        !!element &&
        (!!element.closest("pre") ||
            getComputedStyle(element).getPropertyValue("white-space") === "pre")
    );
}

export const whitespace = `[^\\S\\u00A0\\u0009]`; // for formatting (no "real" content) (TODO: 0009 shouldn't be included)
const whitespaceRegex = new RegExp(`^${whitespace}*$`);
export function isWhitespace(value) {
    const str = typeof value === "string" ? value : value.nodeValue;
    return whitespaceRegex.test(str);
}

// eslint-disable-next-line no-control-regex
const visibleCharRegex = /[^\s\u200b]|[\u00A0\u0009]$/; // contains at least a char that is always visible (TODO: 0009 shouldn't be included)
export function isVisibleTextNode(testedNode) {
    if (!testedNode || !testedNode.length || testedNode.nodeType !== Node.TEXT_NODE) {
        return false;
    }
    if (
        visibleCharRegex.test(testedNode.textContent) ||
        (isInPre(testedNode) && isWhitespace(testedNode))
    ) {
        return true;
    }
    if (testedNode.textContent === "\u200B") {
        return false;
    }
    // The following assumes node is made entirely of whitespace and is not
    // preceded of followed by a block.
    // Find out contiguous preceding and following text nodes
    let preceding;
    let following;
    // Control variable to know whether the current node has been found
    let foundTestedNode;
    const currentNodeParentBlock = closestBlock(testedNode);
    if (!currentNodeParentBlock) {
        return false;
    }
    const nodeIterator = document.createNodeIterator(currentNodeParentBlock);
    for (let node = nodeIterator.nextNode(); node; node = nodeIterator.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
            // If we already found the tested node, the current node is the
            // contiguous following, and we can stop looping
            // If the current node is the tested node, mark it as found and
            // continue.
            // If we haven't reached the tested node, overwrite the preceding
            // node.
            if (foundTestedNode) {
                following = node;
                break;
            } else if (testedNode === node) {
                foundTestedNode = true;
            } else {
                preceding = node;
            }
        } else if (isBlock(node)) {
            // If we found the tested node, then the following node is irrelevant
            // If we didn't, then the current preceding node is irrelevant
            if (foundTestedNode) {
                break;
            } else {
                preceding = null;
            }
        } else if (foundTestedNode && !isWhitespace(node)) {
            // <block>space<inline>text</inline></block> -> space is visible
            following = node;
            break;
        }
    }
    while (following && !visibleCharRegex.test(following.textContent)) {
        following = following.nextSibling;
    }
    // Missing preceding or following: invisible.
    // Preceding or following not in the same block as tested node: invisible.
    if (
        !(preceding && following) ||
        currentNodeParentBlock !== closestBlock(preceding) ||
        currentNodeParentBlock !== closestBlock(following)
    ) {
        return false;
    }
    // Preceding is whitespace or following is whitespace: invisible
    return visibleCharRegex.test(preceding.textContent);
}

/**
 * Returns whether the given node is a element that could be considered to be
 * removed by itself = self closing tags.
 *
 * @param {Node} node
 * @returns {boolean}
 */
const selfClosingElementTags = ["BR", "IMG", "INPUT"];
export function isSelfClosingElement(node) {
    return node && selfClosingElementTags.includes(node.nodeName);
}

/**
 * Returns whether removing the given node from the DOM will have a visible
 * effect or not.
 *
 * Note: TODO this is not handling all cases right now, just the ones the
 * caller needs at the moment. For example a space text node between two inlines
 * will always return 'true' while it is sometimes invisible.
 *
 * @param {Node} node
 * @returns {boolean}
 */
export function isVisible(node) {
    return (
        !!node &&
        ((node.nodeType === Node.TEXT_NODE && isVisibleTextNode(node)) ||
            isSelfClosingElement(node) ||
            hasVisibleContent(node))
    );
}
export function hasVisibleContent(node) {
    return [...(node?.childNodes || [])].some((n) => isVisible(n));
}

export const isNotEditableNode = (node) =>
    node.getAttribute &&
    node.getAttribute("contenteditable") &&
    node.getAttribute("contenteditable").toLowerCase() === "false";
