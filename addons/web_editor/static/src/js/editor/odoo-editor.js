odoo.define('web_editor.odoo-editor', (function(require) {
var exportVariable = (function (exports) {
    'use strict';

    const INVISIBLE_REGEX = /\u200c/g;

    const DIRECTIONS = {
        LEFT: false,
        RIGHT: true,
    };
    const CTYPES = { // Short for CONTENT_TYPES
        // Inline group
        CONTENT: 1,
        SPACE: 2,

        // Block group
        BLOCK_OUTSIDE: 4,
        BLOCK_INSIDE: 8,

        // Br group
        BR: 16,
    };
    const CTGROUPS = { // Short for CONTENT_TYPE_GROUPS
        INLINE: CTYPES.CONTENT | CTYPES.SPACE,
        BLOCK: CTYPES.BLOCK_OUTSIDE | CTYPES.BLOCK_INSIDE,
        BR: CTYPES.BR,
    };

    //------------------------------------------------------------------------------
    // Position and sizes
    //------------------------------------------------------------------------------

    /**
     * @param {Node} node
     * @returns {Array.<HTMLElement, number>}
     */
    function leftPos(node) {
        return [node.parentNode, childNodeIndex(node)];
    }
    /**
     * @param {Node} node
     * @returns {Array.<HTMLElement, number>}
     */
    function rightPos(node) {
        return [node.parentNode, childNodeIndex(node) + 1];
    }
    /**
     * @param {Node} node
     * @returns {Array.<HTMLElement, number, HTMLElement, number>}
     */
    function boundariesOut(node) {
        const index = childNodeIndex(node);
        return [node.parentNode, index, node.parentNode, index + 1];
    }
    /**
     * @param {Node} node
     * @returns {Array.<Node, number>}
     */
    function startPos(node) {
        return [node, 0];
    }
    /**
     * @param {Node} node
     * @returns {Array.<Node, number>}
     */
    function endPos(node) {
        return [node, nodeSize(node)];
    }
    /**
     * Returns the given node's position relative to its parent (= its index in the
     * child nodes of its parent).
     *
     * @param {Node} node
     * @returns {number}
     */
    function childNodeIndex(node) {
        let i = 0;
        while (node.previousSibling) {
            i++;
            node = node.previousSibling;
        }
        return i;
    }
    /**
     * Returns the size of the node = the number of characters for text nodes and
     * the number of child nodes for element nodes.
     *
     * @param {Node} node
     * @returns {number}
     */
    function nodeSize(node) {
        const isTextNode = node.nodeType === Node.TEXT_NODE;
        return isTextNode ? node.length : node.childNodes.length;
    }

    //------------------------------------------------------------------------------
    // DOM Path and node research functions
    //------------------------------------------------------------------------------

    const closestPath = function* (node) {
        while (node) {
            yield node;
            node = node.parentNode;
        }
    };

    const leftDeepFirstPath = createDOMPathGenerator(DIRECTIONS.LEFT, false, false);
    const leftDeepOnlyPath = createDOMPathGenerator(DIRECTIONS.LEFT, true, false);
    const leftDeepOnlyInlinePath = createDOMPathGenerator(DIRECTIONS.LEFT, true, true);
    const leftDeepOnlyInlineInScopePath = createDOMPathGenerator(DIRECTIONS.LEFT, true, true, true);
    const rightDeepOnlyPath = createDOMPathGenerator(DIRECTIONS.RIGHT, true, false);
    const rightDeepOnlyInlinePath = createDOMPathGenerator(DIRECTIONS.RIGHT, true, true);
    const rightDeepOnlyInlineInScopePath = createDOMPathGenerator(DIRECTIONS.RIGHT, true, true, true);

    function findNode(domPath, findCallback = node => true, stopCallback = node => false) {
        for (const node of domPath) {
            if (findCallback(node)) {
                return node;
            }
            if (stopCallback(node)) {
                break;
            }
        }
        return null;
    }

    function closestBlock(node) {
        return findNode(closestPath(node), node => isBlock(node));
    }
    /**
     * Returns the deepest child in last position.
     *
     * @param {Node} node
     * @param {boolean} [inline=false]
     * @returns {Node}
     */
    function latestChild(node, inline = false) {
        while (node && node.lastChild && (!inline || !isBlock(node))) {
            node = node.lastChild;
        }
        return node;
    }
    /**
     * Returns the deepest child in first position.
     *
     * @param {Node} node
     * @param {boolean} [inline=false]
     * @returns {Node}
     */
    function firstChild(node, inline = false) {
        while (node && node.firstChild && (!inline || !isBlock(node))) {
            node = node.firstChild;
        }
        return node;
    }
    /**
     * Values which can be returned while browsing the DOM which gives information
     * to why the path ended.
     */
    const PATH_END_REASONS = {
        NO_NODE: 0,
        BLOCK_OUT: 1,
        BLOCK_HIT: 2,
        OUT_OF_SCOPE: 3,
    };
    /**
     * Creates a generator function according to the given parameters. Pre-made
     * generators to traverse the DOM are made using this function:
     *
     * @see leftDeepFirstPath
     * @see leftDeepOnlyPath
     * @see leftDeepFirstInlinePath
     * @see leftDeepOnlyInlinePath
     *
     * @see rightDeepFirstPath
     * @see rightDeepOnlyPath
     * @see rightDeepFirstInlinePath
     * @see rightDeepOnlyInlinePath
     *
     * @param {number} direction
     * @param {boolean} deepOnly
     * @param {boolean} inline
     */
    function createDOMPathGenerator(direction, deepOnly, inline, inScope = false) {
        const nextDeepest = direction === DIRECTIONS.LEFT
            ? node => latestChild(node.previousSibling, inline)
            : node => firstChild(node.nextSibling, inline);

        const firstNode = direction === DIRECTIONS.LEFT
            ? (node, offset) => latestChild(node.childNodes[offset - 1], inline)
            : (node, offset) => firstChild(node.childNodes[offset], inline);

        // Note "reasons" is a way for the caller to be able to know why the
        // generator ended yielding values.
        return function* (node, offset, reasons = []) {
            let movedUp = false;

            let currentNode = firstNode(node, offset);
            if (!currentNode) {
                movedUp = true;
                currentNode = node;
            }

            while (currentNode) {
                if (inline && isBlock(currentNode)) {
                    reasons.push(movedUp ? PATH_END_REASONS.BLOCK_OUT : PATH_END_REASONS.BLOCK_HIT);
                    break;
                }
                if (inScope && currentNode === node) {
                    reasons.push(PATH_END_REASONS.OUT_OF_SCOPE);
                    break;
                }
                if (!deepOnly || !movedUp) {
                    yield currentNode;
                }

                movedUp = false;
                let nextNode = nextDeepest(currentNode);
                if (!nextNode) {
                    movedUp = true;
                    nextNode = currentNode.parentNode;
                }
                currentNode = nextNode;
            }

            reasons.push(PATH_END_REASONS.NO_NODE);
        };
    }

    //------------------------------------------------------------------------------
    // Cursor management
    //------------------------------------------------------------------------------

    /**
     * From a given position, returns the normalized version.
     *
     * E.g. <b>abc</b>[]def -> <b>abc[]</b>def
     *
     * @param {Node} node
     * @param {number} offset
     * @param {boolean} [full=true] (if not full, it means we only normalize
     *     positions which are not possible, like the cursor inside an image).
     */
    function getNormalizedCursorPosition(node, offset, full = true) {
        if (isVisibleEmpty(node)) {
            // Cannot put cursor inside those elements, put it after instead.
            [node, offset] = rightPos(node);
        }

        // Be permissive about the received offset.
        offset = Math.min(Math.max(offset, 0), nodeSize(node));

        if (full) {
            // Put the cursor in deepest inline node around the given position if
            // possible.
            let el;
            let elOffset;
            if (node.nodeType === Node.ELEMENT_NODE) {
                el = node;
                elOffset = offset;
            } else if (node.nodeType === Node.TEXT_NODE) {
                if (offset === 0) {
                    el = node.parentNode;
                    elOffset = childNodeIndex(node);
                } else if (offset === node.length) {
                    el = node.parentNode;
                    elOffset = childNodeIndex(node) + 1;
                }
            }
            if (el) {
                const leftInlineNode = leftDeepOnlyInlineInScopePath(el, elOffset).next().value;
                let leftVisibleEmpty = false;
                if (leftInlineNode) {
                    leftVisibleEmpty = isVisibleEmpty(leftInlineNode);
                    [node, offset] = leftVisibleEmpty ? rightPos(leftInlineNode) : endPos(leftInlineNode);
                }
                if (!leftInlineNode || leftVisibleEmpty) {
                    const rightInlineNode = rightDeepOnlyInlineInScopePath(el, elOffset).next().value;
                    if (rightInlineNode) {
                        const rightVisibleEmpty = isVisibleEmpty(rightInlineNode);
                        if (!(leftVisibleEmpty && rightVisibleEmpty)) {
                            [node, offset] = rightVisibleEmpty ? leftPos(rightInlineNode) : startPos(rightInlineNode);
                        }
                    }
                }
            }
        }

        const prevNode = node.nodeType === Node.ELEMENT_NODE && node.childNodes[offset - 1];
        if (prevNode && prevNode.nodeName === 'BR' && isFakeLineBreak(prevNode)) {
            // If trying to put the cursor on the right of a fake line break, put
            // it before instead.
            offset--;
        }

        return [node, offset];
    }
    /**
     * @param {Node} anchorNode
     * @param {number} anchorOffset
     * @param {Node} focusNode
     * @param {number} focusOffset
     * @param {boolean} [normalize=true]
     * @returns {?Array.<Node, number}
     */
    function setCursor(anchorNode, anchorOffset, focusNode = anchorNode, focusOffset = anchorOffset, normalize = true) {
        if (!anchorNode || !anchorNode.parentNode || !anchorNode.parentNode.closest('body')
                || !focusNode || !focusNode.parentNode || !focusNode.parentNode.closest('body')) {
            return null;
        }

        const seemsCollapsed = (anchorNode === focusNode && anchorOffset === focusOffset);
        [anchorNode, anchorOffset] = getNormalizedCursorPosition(anchorNode, anchorOffset, normalize);
        [focusNode, focusOffset] = seemsCollapsed ? [anchorNode, anchorOffset] : getNormalizedCursorPosition(focusNode, focusOffset, normalize);

        const direction = getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset);
        const sel = document.defaultView.getSelection();
        const range = new Range();
        if (direction === DIRECTIONS.RIGHT) {
            range.setStart(anchorNode, anchorOffset);
            range.collapse(true);
        } else {
            range.setEnd(anchorNode, anchorOffset);
            range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
        sel.extend(focusNode, focusOffset);

        return [anchorNode, anchorOffset, focusNode, focusOffset];
    }
    /**
     * @param {Node} node
     * @param {boolean} [normalize=true]
     * @returns {?Array.<Node, number}
     */
    function setCursorStart(node, normalize = true) {
        const pos = startPos(node);
        return setCursor(...pos, ...pos, normalize);
    }
    /**
     * From selection position, checks if it is left-to-right or right-to-left.
     *
     * @param {Node} anchorNode
     * @param {number} anchorOffset
     * @param {Node} focusNode
     * @param {number} focusOffset
     * @returns {(number|false)} the direction of false if the selection is collapsed
     */
    function getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset) {
        if (anchorNode==focusNode) {
            if (anchorOffset == focusOffset)
                return false;
            return anchorOffset<focusOffset ? DIRECTIONS.LEFT : DIRECTIONS.RIGHT;
        }
        return (anchorNode.compareDocumentPosition(focusNode) & Node.DOCUMENT_POSITION_FOLLOWING) ? DIRECTIONS.LEFT : DIRECTIONS.RIGHT;
    }

    function getCursors() {
        let sel = document.defaultView.getSelection();
        if (getCursorDirection(sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset) == DIRECTIONS.RIGHT)
            return [[sel.focusNode, sel.focusOffset], [sel.anchorNode, sel.anchorOffset]];
        return [[sel.anchorNode, sel.anchorOffset], [sel.focusNode, sel.focusOffset]];
    }

    function preserveCursor(sel) {
        sel = sel || document.defaultView.getSelection();
        let cursorPos = [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset];
        return (replace) => {
            replace = replace || new Map();
            cursorPos[0] = replace.get(cursorPos[0]) || cursorPos[0];
            cursorPos[2] = replace.get(cursorPos[2]) || cursorPos[2];
            setCursor(...cursorPos);
        }
    }

    //------------------------------------------------------------------------------
    // DOM Info utils
    //------------------------------------------------------------------------------

    /**
     * The following is a complete list of all HTML "block-level" elements.
     *
     * Source:
     * https://developer.mozilla.org/en-US/docs/Web/HTML/Block-level_elements
     *
     * */
    const blockTagNames = [
        'ADDRESS',
        'ARTICLE',
        'ASIDE',
        'BLOCKQUOTE',
        'DETAILS',
        'DIALOG',
        'DD',
        'DIV',
        'DL',
        'DT',
        'FIELDSET',
        'FIGCAPTION',
        'FIGURE',
        'FOOTER',
        'FORM',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'HEADER',
        'HGROUP',
        'HR',
        'LI',
        'MAIN',
        'NAV',
        'OL',
        'P',
        'PRE',
        'SECTION',
        'TABLE',
        'UL',
        // The following elements are not in the W3C list, for some reason.
        'SELECT',
        'TR',
        'TD',
        'TBODY',
        'THEAD',
        'TH',
    ];
    const computedStyles = new WeakMap();
    /**
     * Return true if the given node is a block-level element, false otherwise.
     *
     * @param node
     */
    function isBlock(node) {
        if (!(node instanceof Element)) {
            return false;
        }
        const tagName = node.nodeName.toUpperCase();
        // Every custom jw-* node will be considered as blocks.
        if (tagName.startsWith('JW-') || tagName === 'T') {
            return true;
        }
        // The node might not be in the DOM, in which case it has no CSS values.
        if (window.document !== node.ownerDocument) {
            return blockTagNames.includes(tagName);
        }
        // We won't call `getComputedStyle` more than once per node.
        let style = computedStyles.get(node);
        if (!style) {
            style = window.getComputedStyle(node);
            computedStyles.set(node, style);
        }
        if (style.display) {
            return !style.display.includes('inline') && style.display !== 'contents';
        }
        return blockTagNames.includes(tagName);
    }

    function isUnbreakable(node) {
        if (!node || node.nodeType === Node.TEXT_NODE) {
            return false;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return true;
        }
        const isEditableRoot = node.isContentEditable && !node.parentElement.isContentEditable;
        return isEditableRoot || node.hasAttribute('t') || ['TABLE', 'TR', 'TD'].includes(node.tagName) || node.classList.contains('oe_unbreakable');
    }

    function containsUnbreakable(node) {
        if (!node) {
            return false;
        }
        return isUnbreakable(node) || containsUnbreakable(node.firstChild);
    }

    // optimize: use the parent Oid to speed up detection
    function getOuid(node, optimize=false) {
        while (node && !isUnbreakable(node)) {
            if (node.ouid && optimize)
                return node.ouid
            node = node.parentNode;
        }
        return node && node.oid;
    }
    /**
     * Returns whether the given node is a element that could be considered to be
     * removed by itself = self closing tags.
     *
     * @param {Node} node
     * @returns {boolean}
     */
    const selfClosingElementTags = ['BR', 'IMG', 'INPUT'];
    function isVisibleEmpty(node) {
        return selfClosingElementTags.includes(node.nodeName);
    }
    /**
     * Returns true if the given node is in a PRE context for whitespace handling.
     *
     * @param {Node} node
     * @returns {boolean}
     */
    function isInPre(node) {
        let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        return !!element && (
            !!element.closest('pre') ||
            getComputedStyle(element).getPropertyValue('white-space') === 'pre'
        );
    }
    /**
     * Returns whether the given string (or given text node value) has
     * non-whitespace characters in it.
     */
    const nonWhitespacesRegex = /[\S\u00A0]/;
    function isVisibleStr(value) {
        const str = typeof value === 'string' ? value : value.nodeValue;
        return nonWhitespacesRegex.test(str);
    }
    /**
     * @param {Node} node
     * @returns {boolean}
     */
    function isContentTextNode(node) {
        return node.nodeType === Node.TEXT_NODE && (isVisibleStr(node) || isInPre(node));
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
    function isVisible(node) {
        if (!node) return false;
        if (node.nodeType === Node.TEXT_NODE) {
            if (!node.length) {
                return false;
            }
            // If contains non-whitespaces: visible
            if (isVisibleStr(node)) {
                return true;
            }
            // If only whitespaces, visible only if has inline content before and
            // after the text node, so '___' is not visible in those cases:
            // - <p>a</p>___<p>b</p>
            // - <p>a</p>___b
            // - a___<p>b</p>
            // TODO see documentation comment
            return (node.previousSibling && !isBlock(node.previousSibling) && node.nextSibling && !isBlock(node.nextSibling));
        }
        if (isBlock(node) || isVisibleEmpty(node)) {
            return true;
        }
        return [...node.childNodes].some(n => isVisible(n));
    }

    function parentsGet(node, root = undefined) {
        let parents = [];
        while (node) {
            parents.unshift(node);
            if (node === root) {
                break;
            }
            node = node.parentNode;
        }
        return parents;
    }

    function commonParentGet(node1, node2, root = undefined) {
        if (!node1 || !node2) {
            return null;
        }
        let n1p = parentsGet(node1, root);
        let n2p = parentsGet(node2, root);
        while (n1p.length > 1 && n1p[1] === n2p[1]) {
            n1p.shift();
            n2p.shift();
        }
        return n1p[0];
    }

    function getListMode(pnode) {
        if (pnode.tagName == 'OL')
            return 'OL';
        return pnode.classList.contains('checklist') ? 'CL' : 'UL';
    }

    function createList(mode) {
        let node = document.createElement(mode=='OL' ? 'OL': 'UL');
        if (mode == 'CL') {
            node.classList.add("checklist");
        }
        return node;
    }

    function toggleClass(node, className) {
        node.classList.toggle(className);
        if (!node.className) {
            node.removeAttribute("class");
        }
    }

    /**
     * Returns whether or not the given node is a BR element which does not really
     * act as a line break, but as a placeholder for the cursor or to make some left
     * element (like a space) visible.
     *
     * @param {HTMLBRElement} brEl
     * @returns {boolean}
     */
    function isFakeLineBreak(brEl) {
        return !(getState(...rightPos(brEl), DIRECTIONS.RIGHT).cType & (CTGROUPS.INLINE | CTGROUPS.BR));
    }
    /**
     * Checks whether or not the given block has any visible content, except for
     * a placeholder BR.
     *
     * @param {HTMLElement} blockEl
     * @returns {boolean}
     */
    function isEmptyBlock(blockEl) {
        if (isVisibleStr(blockEl.textContent)) {
            return false;
        }
        if (blockEl.querySelectorAll('br').length >= 2) {
            return false;
        }
        const nodes = blockEl.querySelectorAll('*');
        for (const node of nodes) {
            // There is no text and no double BR, the only thing that could make
            // this visible is a "visible empty" node like an image.
            if ((node.nodeName != 'BR') && isVisibleEmpty(node)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Checks whether or not the given block element has something to make it have
     * a visible height (except for padding / border).
     *
     * @param {HTMLElement} blockEl
     * @returns {boolean}
     */
    function isShrunkBlock(blockEl) {
        return isEmptyBlock(blockEl) && !blockEl.querySelector('br');
    }

    //------------------------------------------------------------------------------
    // DOM Modification
    //------------------------------------------------------------------------------

    /**
     * Splits a text node in two parts.
     * If the split occurs at the beginning or the end, the text node stays
     * untouched and unsplit. If a split actually occurs, the original text node
     * still exists and become the right part of the split.
     *
     * Note: if split after or before whitespace, that whitespace may become
     * invisible, it is up to the caller to replace it by nbsp if needed.
     *
     * @param {Text} textNode
     * @param {number} offset
     * @returns {number} The parentOffset if the cursor was between the two text
     *          node parts after the split.
     */
    function splitTextNode(textNode, offset) {
        let parentOffset = childNodeIndex(textNode);

        if (offset > 0) {
            parentOffset++;

            if (offset < textNode.length) {
                const newval = textNode.nodeValue.substring(0, offset);
                const nextTextNode = document.createTextNode(newval);
                textNode.before(nextTextNode);
                textNode.nodeValue = textNode.nodeValue.substring(offset);
            }
        }
        return parentOffset;
    }

    function insertText(sel, content) {
        if (sel.anchorNode.nodeType == Node.TEXT_NODE) {
            let pos = [sel.anchorNode.parentElement, splitTextNode(sel.anchorNode, sel.anchorOffset)];
            setCursor(...pos, ...pos, false);
        }
        const txt = document.createTextNode(content || '#');
        const restore = prepareUpdate(sel.anchorNode, sel.anchorOffset);
        sel.getRangeAt(0).insertNode(txt);
        restore();
        setCursor(...boundariesOut(txt), false);
    }

    /**
     * Add a BR in the given node if its closest ancestor block has nothing to make
     * it visible.
     *
     * @param {HTMLElement} el
     */
    function fillEmpty(el) {
        const blockEl = closestBlock(el);
        if (isShrunkBlock(blockEl)) {
            blockEl.appendChild(document.createElement('br'));
        }
    }
    /**
     * Removes the given node if invisible and all its invisible ancestors.
     *
     * @param {Node} node
     * @returns {Node} the first visible ancestor of node (or itself)
     */
    function clearEmpty(node) {
        while (!isVisible(node)) {
            const toRemove = node;
            node = node.parentNode;
            toRemove.remove();
        }
        return node;
    }

    function setTagName(el, newTagName) {
        if (el.tagName == newTagName) {
            return el;
        }
        var n = document.createElement(newTagName);
        var attr = el.attributes;
        for (var i = 0, len = attr.length; i < len; ++i) {
            n.setAttribute(attr[i].name, attr[i].value);
        }
        while (el.firstChild) {
            n.append(el.firstChild);
        }
        if (el.tagName === 'LI') {
            el.append(n);
        } else {
            el.parentNode.replaceChild(n, el);
        }
        return n;
    }
    /**
     * Moves the given subset of nodes of a source element to the given destination.
     * If the source element is left empty it is removed. This ensures the moved
     * content and its destination surroundings are restored (@see restoreState) to
     * the way there were.
     *
     * It also reposition at the right position on the left of the moved nodes.
     *
     * @param {HTMLElement} destinationEl
     * @param {number} destinationOffset
     * @param {HTMLElement} sourceEl
     * @param {number} [startIndex=0]
     * @param {number} [endIndex=sourceEl.childNodes.length]
     * @returns {Array.<HTMLElement, number} The position at the left of the moved
     *     nodes after the move was done (and where the cursor was returned).
     */
    function moveNodes(destinationEl, destinationOffset, sourceEl, startIndex = 0, endIndex = sourceEl.childNodes.length) {
        // For table elements, there just cannot be a meaningful move, add them
        // after the table.
        if (['TABLE', 'TBODY', 'THEAD', 'TFOOT', 'TR', 'TH', 'TD'].includes(destinationEl.tagName)) {
            [destinationEl, destinationOffset] = rightPos(destinationEl);
        }

        const nodes = [];
        for (let i = startIndex; i < endIndex; i++) {
            nodes.push(sourceEl.childNodes[i]);
        }

        if (nodes.length) {
            const restoreDestination = prepareUpdate(destinationEl, destinationOffset);
            const restoreMoved = prepareUpdate(...leftPos(sourceEl.childNodes[startIndex]), ...rightPos(sourceEl.childNodes[endIndex - 1]));
            const fragment = document.createDocumentFragment();
            nodes.forEach(node => fragment.appendChild(node));
            const posRightNode = destinationEl.childNodes[destinationOffset];
            if (posRightNode) {
                destinationEl.insertBefore(fragment, posRightNode);
            } else {
                destinationEl.appendChild(fragment);
            }
            restoreDestination();
            restoreMoved();
        }

        if (!nodeSize(sourceEl)) {
            const restoreOrigin = prepareUpdate(...boundariesOut(sourceEl));
            sourceEl.remove();
            restoreOrigin();
        }

        // Return cursor position, but don't change it
        const firstNode = nodes.find(node => !!node.parentNode);
        return firstNode ? leftPos(firstNode) : [destinationEl, destinationOffset];
    }

    //------------------------------------------------------------------------------
    // Prepare / Save / Restore state utilities
    //------------------------------------------------------------------------------

    /**
     * Any editor command is applied to a selection (collapsed or not). After the
     * command, the content type on the selection boundaries, in both direction,
     * should be preserved (some whitespace should disappear as went from collapsed
     * to non collapsed, or converted to &nbsp; as went from non collapsed to
     * collapsed, there also <br> to remove/duplicate, etc).
     *
     * This function returns a callback which allows to do that after the command
     * has been done.
     *
     * Note: the method has been made generic enough to work with non-collapsed
     * selection but can be used for an unique cursor position.
     *
     * @param {HTMLElement} el
     * @param {number} offset
     * @param {...(HTMLElement|number)} args - argument 1 and 2 can be repeated for
     *     multiple preparations with only one restore callback returned. Note: in
     *     that case, the positions should be given in the document node order.
     * @returns {function}
     */
    function prepareUpdate(el, offset, ...args) {
        const positions = [...arguments];

        // Check the state in each direction starting from each position.
        const restoreData = [];
        while (positions.length) {
            // Note: important to get the positions in reverse order to restore
            // right side before left side.
            offset = positions.pop();
            el = positions.pop();
            const left = getState(el, offset, DIRECTIONS.LEFT);
            restoreData.push(left);
            restoreData.push(getState(el, offset, DIRECTIONS.RIGHT, left.cType));
        }

        // Create the callback that will be able to restore the state in each
        // direction wherever the node in the opposite direction has landed.
        return function restoreStates() {
            for (const data of restoreData) {
                restoreState(data);
            }
        };
    }
    /**
     * Retrieves the "state" from a given position looking at the given direction.
     * The "state" is the type of content. The functions also returns the first
     * meaninful node looking in the opposite direction = the first node we trust
     * will not disappear if a command is played in the given direction.
     *
     * Note: only work for in-between nodes positions. If the position is inside a
     * text node, first split it @see splitTextNode.
     *
     * @param {HTMLElement} el
     * @param {number} offset
     * @param {number} direction @see DIRECTIONS.LEFT @see DIRECTIONS.RIGHT
     * @returns {Object}
     */
    function getState(el, offset, direction, leftCType) {
        const leftDOMPath = leftDeepOnlyInlinePath;
        const rightDOMPath = rightDeepOnlyInlinePath;

        let domPath;
        let inverseDOMPath;
        let expr;
        const reasons = [];
        if (direction === DIRECTIONS.LEFT) {
            domPath = leftDOMPath(el, offset, reasons);
            inverseDOMPath = rightDOMPath(el, offset);
            expr = /[^\S\u00A0]$/;
        } else {
            domPath = rightDOMPath(el, offset, reasons);
            inverseDOMPath = leftDOMPath(el, offset);
            expr = /^[^\S\u00A0]/;
        }

        // TODO I think sometimes, the node we have to consider as the
        // anchor point to restore the state is not the first one of the inverse
        // path (like for example, empty text nodes that may disappear
        // after the command so we would not want to get those ones).
        const boundaryNode = inverseDOMPath.next().value;

        // We only traverse through deep inline nodes. If we cannot find a
        // meanfingful state between them, that means we hit a block.
        let cType = undefined;

        // Traverse the DOM in the given direction to check what type of content
        // there is.
        let lastSpace = null;
        for (const node of domPath) {
            if (node.nodeType === Node.TEXT_NODE) {
                const value = node.nodeValue.replace(INVISIBLE_REGEX, '');
                // If we hit a text node, the state depends on the path direction:
                // any space encountered backwards is a visible space if we hit
                // visible content afterwards. If going forward, spaces are only
                // visible if we have content backwards.
                if (direction === DIRECTIONS.LEFT) {
                    if (isVisibleStr(value)) {
                        cType = (lastSpace || expr.test(value)) ? CTYPES.SPACE : CTYPES.CONTENT;
                        break;
                    }
                    if (value.length) {
                        lastSpace = node;
                    }
                } else {
                    leftCType = leftCType || getState(el, offset, DIRECTIONS.LEFT).cType;
                    if (expr.test(value)) {
                        const rct = isVisibleStr(value) ? CTYPES.CONTENT : getState(...rightPos(node), DIRECTIONS.RIGHT).cType;
                        cType = ((leftCType & CTYPES.CONTENT) && (rct & (CTYPES.CONTENT | CTYPES.BR))) ? CTYPES.SPACE: rct;
                        break;
                    }
                    if (isVisibleStr(value)) {
                        cType = CTYPES.CONTENT;
                        break;
                    }
                }
            } else if (node.nodeName === 'BR') {
                cType = CTYPES.BR;
                break;
            } else if (isVisible(node)) {
                // E.g. an image
                cType = CTYPES.CONTENT;
                break;
            }
        }

        if (cType === undefined) {
            cType = reasons.includes(PATH_END_REASONS.BLOCK_HIT) ? CTYPES.BLOCK_OUTSIDE : CTYPES.BLOCK_INSIDE;
        }

        return {
            node: boundaryNode,
            direction: direction,
            cType: cType, // Short for contentType
        };
    }
    const priorityRestoreStateRules = [
        // Each entry is a list of two objects, with each key being optional (the
        // more key-value pairs, the bigger the priority).
        // {direction: ..., cType1: ..., cType2: ...}
        // ->
        // {spaceVisibility: (false|true), brVisibility: (false|true)}
        [
            // Replace a space by &nbsp; when it was not collapsed before and now is
            // collapsed (one-letter word removal for example).
            {cType1: CTYPES.CONTENT, cType2: CTYPES.SPACE | CTGROUPS.BLOCK},
            {spaceVisibility: true},
        ],
        [
            // Replace a space by &nbsp; when it was content before and now it is
            // a BR.
            {direction: DIRECTIONS.LEFT, cType1: CTGROUPS.INLINE, cType2: CTGROUPS.BR},
            {spaceVisibility: true},
        ],
        [
            // Replace a space by &nbsp; when it was visible thanks to a BR which
            // is now gone.
            {direction: DIRECTIONS.RIGHT, cType1: CTGROUPS.BR, cType2: CTYPES.SPACE | CTGROUPS.BLOCK},
            {spaceVisibility: true},
        ],
        [
            // Remove all collapsed spaces when a space is removed.
            {cType1: CTYPES.SPACE},
            {spaceVisibility: false},
        ],
        [
            // Remove spaces once the preceeding BR is removed
            {direction: DIRECTIONS.LEFT, cType1: CTGROUPS.BR},
            {spaceVisibility: false},
        ],
        [
            // Remove space before block once content is put after it (otherwise it
            // would become visible).
            {cType1: CTGROUPS.BLOCK, cType2: CTGROUPS.INLINE | CTGROUPS.BR},
            {spaceVisibility: false},
        ],
        [
            // Duplicate a BR once the content afterwards disappears
            {direction: DIRECTIONS.RIGHT, cType1: CTGROUPS.INLINE, cType2: CTGROUPS.BLOCK},
            {brVisibility: true},
        ],
        [
            // Remove a BR at the end of a block once inline content is put after
            // it (otherwise it would act as a line break).
            {direction: DIRECTIONS.RIGHT, cType1: CTGROUPS.BLOCK, cType2: CTGROUPS.INLINE | CTGROUPS.BR},
            {brVisibility: false},
        ],
        [
            // Remove a BR once the BR that preceeds it is now replaced by
            // content (or if it was a BR at the start of a block which now is
            // a trailing BR).
            {direction: DIRECTIONS.LEFT, cType1: CTGROUPS.BR | CTGROUPS.BLOCK, cType2: CTGROUPS.INLINE},
            {brVisibility: false, extraBRRemovalCondition: brNode => isFakeLineBreak(brNode)},
        ],
    ];
    function restoreStateRuleHashCode(direction, cType1, cType2) {
        return `${direction}-${cType1}-${cType2}`;
    }
    const allRestoreStateRules = (function () {
        const map = new Map();

        const keys = ['direction', 'cType1', 'cType2'];
        for (const direction of Object.values(DIRECTIONS)) {
            for (const cType1 of Object.values(CTYPES)) {
                for (const cType2 of Object.values(CTYPES)) {
                    const rule = {direction: direction, cType1: cType1, cType2: cType2};

                    // Search for the rules which match whatever their priority
                    const matchedRules = [];
                    for (const entry of priorityRestoreStateRules) {
                        let priority = 0;
                        for (const key of keys) {
                            const entryKeyValue = entry[0][key];
                            if (entryKeyValue !== undefined) {
                                if (typeof entryKeyValue === 'boolean' ? (rule[key] === entryKeyValue) : (rule[key] & entryKeyValue)) {
                                    priority++;
                                } else {
                                    priority = -1;
                                    break;
                                }
                            }
                        }
                        if (priority >= 0) {
                            matchedRules.push([priority, entry[1]]);
                        }
                    }

                    // Create the final rule by merging found rules by order of
                    // priority
                    const finalRule = {};
                    for (let p = 0; p <= keys.length; p++) {
                        for (const entry of matchedRules) {
                            if (entry[0] === p) {
                                Object.assign(finalRule, entry[1]);
                            }
                        }
                    }

                    // Create an unique identifier for the set of values
                    // direction - state 1 - state2 to add the rule in the map
                    const hashCode = restoreStateRuleHashCode(direction, cType1, cType2);
                    map.set(hashCode, finalRule);
                }
            }
        }

        return map;
    })();
    /**
     * Restores the given state starting before the given while looking in the given
     * direction.
     *
     * @param {Object} prevStateData @see getState
     */
    function restoreState(prevStateData) {
        const {node, direction, cType: cType1} = prevStateData;
        if (!node || !node.parentNode) {
            // FIXME sometimes we want to restore the state starting from a node
            // which has been removed by another restoreState call... Not sure if
            // it is a problem or not, to investigate.
            return;
        }
        const [el, offset] = direction === DIRECTIONS.LEFT ? leftPos(node) : rightPos(node);
        const {cType: cType2} = getState(el, offset, direction);

        /**
         * Knowing the old state data and the new state data, we know if we have to
         * do something or not, and what to do.
         */
        const ruleHashCode = restoreStateRuleHashCode(direction, cType1, cType2);
        const rule = allRestoreStateRules.get(ruleHashCode);
        if (Object.values(rule).filter(x => x !== undefined).length && !isInPre(el)) {
            const inverseDirection = direction === DIRECTIONS.LEFT ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
            enforceWhitespace(el, offset, inverseDirection, rule);
        }
    }
    /**
     * Enforces the whitespace and BR visibility in the given direction starting
     * from the given position.
     *
     * @param {HTMLElement} el
     * @param {number} offset
     * @param {number} direction @see DIRECTIONS.LEFT @see DIRECTIONS.RIGHT
     * @param {Object} rule
     * @param {boolean} [rule.spaceVisibility]
     * @param {boolean} [rule.brVisibility]
     */
    function enforceWhitespace(el, offset, direction, rule) {
        let domPath;
        let expr;
        if (direction === DIRECTIONS.LEFT) {
            domPath = leftDeepOnlyInlinePath(el, offset);
            expr = /[^\S\u00A0]+$/;
        } else {
            domPath = rightDeepOnlyInlinePath(el, offset);
            expr = /^[^\S\u00A0]+/;
        }

        const invisibleSpaceTextNodes = [];
        let foundVisibleSpaceTextNode = null;
        for (const node of domPath) {
            if (node.nodeName === 'BR') {
                if (rule.brVisibility === undefined) {
                    break;
                }
                if (rule.brVisibility) {
                    node.before(document.createElement('br'));
                } else {
                    if (!rule.extraBRRemovalCondition || rule.extraBRRemovalCondition(node)) {
                        node.remove();
                    }
                }
                break;
            } else if (node.nodeType === Node.TEXT_NODE) {
                if (expr.test(node.nodeValue)) {
                    // If we hit spaces going in the direction, either they are in a
                    // visible text node and we have to change the visibility of
                    // those spaces, or it is in an invisible text node. In that
                    // last case, we either remove the spaces if there are spaces in
                    // a visible text node going further in the direction or we
                    // change the visiblity or those spaces.
                    if (isVisibleStr(node)) {
                        foundVisibleSpaceTextNode = node;
                        break;
                    } else {
                        invisibleSpaceTextNodes.push(node);
                    }
                } else if (isVisibleStr(node)) {
                    break;
                }
            }
        }

        if (rule.spaceVisibility === undefined) {
            return;
        }
        if (!rule.spaceVisibility) {
            for (const node of invisibleSpaceTextNodes) {
                // Empty and not remove to not mess with offset-based positions in
                // commands implementation, also remove non-block empty parents.
                node.nodeValue = '';
                const ancestorPath = closestPath(node.parentNode);
                let toRemove = null;
                for (const pNode of ancestorPath) {
                    if (toRemove) {
                        toRemove.remove();
                    }
                    if (pNode.childNodes.length === 1 && !isBlock(pNode)) {
                        pNode.after(node);
                        toRemove = pNode;
                    } else {
                        break;
                    }
                }
            }
        }
        const spaceNode = (foundVisibleSpaceTextNode || invisibleSpaceTextNodes[0]);
        if (spaceNode) {
            let spaceVisibility = rule.spaceVisibility;
            // In case we are asked to replace the space by a &nbsp;, disobey and
            // do the opposite if that space is currently not visible
            // TODO I'd like this to not be needed, it feels wrong...
            if (spaceVisibility && !foundVisibleSpaceTextNode && getState(...rightPos(spaceNode), DIRECTIONS.RIGHT).cType & CTGROUPS.BLOCK) {
                spaceVisibility = false;
            }
            spaceNode.nodeValue = spaceNode.nodeValue.replace(expr, spaceVisibility ? '\u00A0' : '');
        }
    }

    Text.prototype.oDeleteBackward = function (offset, alreadyMoved = false) {
        const parentNode = this.parentNode;

        if (!offset) {
            // Backspace at the beginning of a text node is not a specific case to
            // handle, let the element implementation handle it.
            HTMLElement.prototype.oDeleteBackward.call(this, offset, alreadyMoved);
            return;
        }

        // First, split around the character where the backspace occurs
        const firstSplitOffset = splitTextNode(this, offset - 1);
        const secondSplitOffset = splitTextNode(parentNode.childNodes[firstSplitOffset], 1);
        let middleNode = parentNode.childNodes[firstSplitOffset];

        // Do remove the character, then restore the state of the surrounding parts.
        const restore = prepareUpdate(parentNode, firstSplitOffset, parentNode, secondSplitOffset);
        const isSpace = !isVisibleStr(middleNode) && !isInPre(middleNode);
        middleNode.remove();
        restore();

        // If the removed element was not visible content, propagate the backspace.
        if (isSpace && (getState(parentNode, firstSplitOffset, DIRECTIONS.LEFT).cType !== CTYPES.CONTENT)) {
            parentNode.oDeleteBackward(firstSplitOffset, alreadyMoved);
            return;
        }

        fillEmpty(parentNode);
        setCursor(parentNode, firstSplitOffset);
    };

    HTMLElement.prototype.oDeleteBackward = function (offset, alreadyMoved = false) {
        let moveDest;
        if (offset) {
            const leftNode = this.childNodes[offset - 1];
            if (isUnbreakable(leftNode)) {
                throw UNBREAKABLE_ROLLBACK_CODE;
            }
            if (!isBlock(leftNode)) {
                /**
                 * Backspace just after an inline node, convert to backspace at the
                 * end of that inline node.
                 *
                 * E.g. <p>abc<i>def</i>[]</p> + BACKSPACE
                 * <=>  <p>abc<i>def[]</i></p> + BACKSPACE
                 */
                leftNode.oDeleteBackward(nodeSize(leftNode), alreadyMoved);
                return;
            }

            /**
             * Backspace just after an block node, we have to move any inline
             * content after it, up to the next block. If the cursor is between
             * two blocks, this is a theoretical case: just do nothing.
             *
             * E.g. <p>abc</p>[]de<i>f</i><p>ghi</p> + BACKSPACE
             * <=>  <p>abcde<i>f</i></p><p>ghi</p>
             */
            alreadyMoved = true;
            moveDest = endPos(leftNode);
        } else {
            if (isUnbreakable(this)) {
                throw UNBREAKABLE_ROLLBACK_CODE;
            }
            const parentEl = this.parentNode;

            if (!isBlock(this)) {
                /**
                 * Backspace at the beginning of an inline node, nothing has to be
                 * done: propagate the backspace. If the node was empty, we remove
                 * it before.
                 *
                 * E.g. <p>abc<b></b><i>[]def</i></p> + BACKSPACE
                 * <=>  <p>abc<b>[]</b><i>def</i></p> + BACKSPACE
                 * <=>  <p>abc[]<i>def</i></p> + BACKSPACE
                 */
                const parentOffset = childNodeIndex(this);
                if (!nodeSize(this)) {
                    const visible = isVisible(this);

                    const restore = prepareUpdate(...boundariesOut(this));
                    this.remove();
                    restore();

                    fillEmpty(parentEl);

                    if (visible) {
                        // TODO this handle BR/IMG/etc removals../ to see if we
                        // prefer to have a dedicated handler for every possible
                        // HTML element or if we let this generic code handle it.
                        setCursor(parentEl, parentOffset);
                        return;
                    }
                }
                parentEl.oDeleteBackward(parentOffset, alreadyMoved);
                return;
            }

            /**
             * Backspace at the beginning of a block node, we have to move the
             * inline content at its beginning outside of the element and propagate
             * to the left block if any.
             *
             * E.g. (prev == block)
             *      <p>abc</p><div>[]def<p>ghi</p></div> + BACKSPACE
             * <=>  <p>abc</p>[]def<div><p>ghi</p></div> + BACKSPACE
             *
             * E.g. (prev != block)
             *      abc<div>[]def<p>ghi</p></div> + BACKSPACE
             * <=>  abc[]def<div><p>ghi</p></div>
             */
            moveDest = leftPos(this);
        }

        let node = this.childNodes[offset];
        let firstBlockIndex = offset;
        while (node && !isBlock(node)) {
            node = node.nextSibling;
            firstBlockIndex++;
        }
        let [cursorNode, cursorOffset] = moveNodes(...moveDest, this, offset, firstBlockIndex);
        setCursor(cursorNode, cursorOffset);

        // Propagate if this is still a block on the left of where the nodes were
        // moved.
        if (cursorNode.nodeType === Node.TEXT_NODE && (cursorOffset === 0 || cursorOffset === cursorNode.length)) {
            cursorOffset = childNodeIndex(cursorNode) + (cursorOffset === 0 ? 0 : 1);
            cursorNode = cursorNode.parentNode;
        }
        if (cursorNode.nodeType !== Node.TEXT_NODE) {
            const {cType} = getState(cursorNode, cursorOffset, DIRECTIONS.LEFT);
            if (cType & CTGROUPS.BLOCK && (!alreadyMoved || cType === CTYPES.BLOCK_OUTSIDE)) {
                cursorNode.oDeleteBackward(cursorOffset, alreadyMoved);
            }
        }
    };

    HTMLLIElement.prototype.oDeleteBackward = function (offset, alreadyMoved = false) {
        if (offset > 0 || this.previousElementSibling) {
            // If backspace inside li content or if the li is not the first one,
            // it behaves just like in a normal element.
            HTMLElement.prototype.oDeleteBackward.call(this, offset, alreadyMoved);
            return;
        }
        this.oShiftTab(offset);
    };


    HTMLBRElement.prototype.oDeleteBackward = function (offset, alreadyMoved = false) {
        let parentOffset = childNodeIndex(this);
        const rightState = getState(this.parentElement, parentOffset+1, DIRECTIONS.RIGHT).cType;
        if (rightState & CTYPES.BLOCK_INSIDE) {
            this.parentElement.oDeleteBackward(parentOffset, alreadyMoved);
        } else {
            HTMLElement.prototype.oDeleteBackward.call(this, offset, alreadyMoved);
        }
    };

    Text.prototype.oDeleteForward = function (offset) {
        if (offset < this.length) {
            this.oDeleteBackward(offset + 1);
        } else {
            HTMLElement.prototype.oDeleteForward.call(this.parentNode, childNodeIndex(this) + 1);
        }
    };

    HTMLElement.prototype.oDeleteForward = function (offset) {
        const filterFunc = node => (isVisibleEmpty(node) || isContentTextNode(node));

        const firstInlineNode = findNode(rightDeepOnlyInlinePath(this, offset), filterFunc);
        if (firstInlineNode && (firstInlineNode.nodeName !== 'BR' || getState(...rightPos(firstInlineNode), DIRECTIONS.RIGHT).cType !== CTYPES.BLOCK_INSIDE)) {
            firstInlineNode.oDeleteBackward(Math.min(1, nodeSize(firstInlineNode)));
            return;
        }
        const firstOutNode = findNode(rightDeepOnlyPath(...(firstInlineNode ? rightPos(firstInlineNode) : [this, offset])), filterFunc);
        if (firstOutNode) {
            const [node, offset] = leftPos(firstOutNode);
            node.oDeleteBackward(offset);
            return;
        }
    };

    Text.prototype.oEnter = function (offset) {
        this.parentElement.oEnter(splitTextNode(this, offset), true);
    };
    /**
     * The whole logic can pretty much be described by this example:
     *
     *     <p><span><b>[]xt</b>ab</span>cd</p> + ENTER
     * <=> <p><span><b><br></b>[]<b>xt</b>ab</span>cd</p> + ENTER
     * <=> <p><span><b><br></b></span>[]<span><b>xt</b>ab</span>cd</p> + ENTER
     * <=> <p><span><b><br></b></span></p><p><span><b>[]xt</b>ab</span>cd</p> + SANITIZE
     * <=> <p><br></p><p><span><b>[]xt</b>ab</span>cd</p>
     *
     * Propagate the split for as long as we split an inline node, then refocus the
     * beginning of the first split node
     */
    HTMLElement.prototype.oEnter = function (offset, firstSplit = true) {
        let restore;
        if (firstSplit) {
            restore = prepareUpdate(this, offset);
        }

        // First split the node in two and move half the children in the clone.
        const splitEl = this.cloneNode(false);
        while (offset < this.childNodes.length) {
            splitEl.appendChild(this.childNodes[offset]);
        }
        this.after(splitEl);

        // Propagate the split until reaching a block element
        if (!isBlock(this)) {
            if (this.parentElement) {
                this.parentElement.oEnter(childNodeIndex(this) + 1, false);
            } else {
                // There was no block parent element in the original chain, consider
                // this unsplittable, like an unbreakable.
                throw UNBREAKABLE_ROLLBACK_CODE;
            }
        }

        // All split have been done, place the cursor at the right position, and
        // fill/remove empty nodes.
        if (firstSplit) {
            restore();

            fillEmpty(clearEmpty(this));
            fillEmpty(splitEl);

            setCursorStart(splitEl);
        }
        return splitEl;
    };
    /**
     * Specific behavior for headings: do not split in two if cursor at the end but
     * instead create a paragraph.
     * Cursor end of line: <h1>title[]</h1> + ENTER <=> <h1>title</h1><p>[]<br/></p>
     * Cursor in the line: <h1>tit[]le</h1> + ENTER <=> <h1>tit</h1><h1>[]le</h1>
     */
    HTMLHeadingElement.prototype.oEnter = function () {
        const newEl = HTMLElement.prototype.oEnter.call(this, ...arguments);
        if (!newEl.textContent) {
            let node = setTagName(newEl, 'P');
            setCursorStart(node);
        }
    };
    /**
     * Same specific behavior as headings elements.
     */
    HTMLQuoteElement.prototype.oEnter = HTMLHeadingElement.prototype.oEnter;
    /**
     * Specific behavior for list items: deletion and unindentation in some cases.
     */
    HTMLLIElement.prototype.oEnter = function (offset, firstSplit = true) {
        // If not last list item or not empty last item, regular block split
        if (this.nextElementSibling || this.textContent) {
            let node = HTMLElement.prototype.oEnter.call(this, ...arguments);
            if (node.classList.contains('checked')) {
                toggleClass(node, "checked");
            }
            return node;
        }
        this.oShiftTab();
    };
    /**
     * Specific behavior for pre: insert newline (\n) in text or insert p at end.
     */
    HTMLPreElement.prototype.oEnter = function (offset, firstSplit = true) {
        if (offset < this.childNodes.length) {
            const newline = document.createTextNode('\n');
            this.insertBefore(newline, this.childNodes[offset]);
        } else {
            let node = document.createElement('p');
            this.parentNode.insertBefore(node, this.nextSibling);
            fillEmpty(node);
            setCursorStart(node);
        }
    };

    Text.prototype.oShiftEnter = function (offset) {
        this.parentElement.oShiftEnter(splitTextNode(this, offset));
    };

    HTMLElement.prototype.oShiftEnter = function (offset) {
        const restore = prepareUpdate(this, offset);

        const brEl = document.createElement('br');
        const brEls = [brEl];
        if (offset >= this.childNodes.length) {
            this.appendChild(brEl);
        } else {
            this.insertBefore(brEl, this.childNodes[offset]);
        }
        if (isFakeLineBreak(brEl) &&
                getState(...leftPos(brEl), DIRECTIONS.LEFT).cType !== CTYPES.BR) {
            const brEl2 = document.createElement('br');
            brEl.before(brEl2);
            brEls.unshift(brEl2);
        }

        restore();

        for (const el of brEls) {
            if (el.parentNode) {
                setCursor(...rightPos(el));
                break;
            }
        }
    };

    Text.prototype.oShiftTab = function (offset) {
        return this.parentElement.oShiftTab(0);
    };

    HTMLElement.prototype.oShiftTab = function (offset = undefined) {
        if (!isUnbreakable(this)) {
            return this.parentElement.oShiftTab(offset);
        }
        return false;
    };

    // returns: is still in a <LI> nested list
    HTMLLIElement.prototype.oShiftTab = function (offset) {
        let li = this;
        if (li.nextElementSibling) {
            let ul = li.parentElement.cloneNode(false);
            while (li.nextSibling) {
                ul.append(li.nextSibling);
            }
            if (li.parentNode.parentNode.tagName === 'LI') {
                let lip = document.createElement("li");
                toggleClass(lip, 'nested');
                lip.append(ul);
                li.parentNode.parentNode.after(lip);
            } else {
                li.parentNode.after(ul);
            }
        }

        const restoreCursor = preserveCursor();
        if (li.parentNode.parentNode.tagName === 'LI') {
            let toremove = !li.previousElementSibling ? li.parentNode.parentNode : null;
            let ul = li.parentNode;
            li.parentNode.parentNode.after(li);
            if (toremove) {
                if (toremove.classList.contains('nested')) {    // <li>content<ul>...</ul></li>
                    toremove.remove();
                } else {                                        // <li class="nested"><ul>...</ul></li>
                    ul.remove();
                }
            }
            restoreCursor();
            return li;
        } else {
            let ul = li.parentNode;
            let p;
            while (li.firstChild) {
                if (isBlock(li.firstChild)) {
                    p = isVisible(p) && ul.after(p) && undefined;
                    ul.after(li.firstChild);
                } else {
                    p = p || document.createElement('P');
                    p.append(li.firstChild);
                }
            }
            if (isVisible(p))
                ul.after(p);

            restoreCursor(new Map([[li, ul.nextSibling]]));
            li.remove();
            if (!ul.firstElementChild) {
                ul.remove();
            }
        }
        return false;
    };

    Text.prototype.oTab = function (offset) {
        return this.parentElement.oTab(0);
    };

    HTMLElement.prototype.oTab = function (offset) {
        if (!isBlock(this)) {
            return this.parentElement.oTab(offset);
        }
        return false;
    };

    HTMLLIElement.prototype.oTab = function (offset) {
        let lip = document.createElement("li");
        let destul = this.previousElementSibling?.querySelector('ol, ul');
        destul ||= this.nextElementSibling?.querySelector('ol, ul');
        destul ||= this.closest('ul, ol');

        let ul = createList(getListMode(destul));
        lip.append(ul);

        const cr = preserveCursor();
        toggleClass(lip, 'nested');
        this.before(lip);
        ul.append(this);
        cr();
        return true;
    };

    Text.prototype.oToggleList = function (offset, mode) {
        this.parentElement.oToggleList(childNodeIndex(this), mode);
    };

    HTMLElement.prototype.oToggleList = function (offset, mode='UL') {
        if (!isBlock(this)) {
            return this.parentElement.oToggleList(childNodeIndex(this));
        }
        let inLI = this.closest('li');
        if (inLI) {
            return inLI.oToggleList(0, mode);
        }

        let main = createList(mode);
        let li = document.createElement('LI');
        main.append(li);
        const restoreCursor = preserveCursor();

        this.after(main);
        li.append(this);
        restoreCursor(new Map([[this, li]]));
    };

    HTMLParagraphElement.prototype.oToggleList = function (offset, mode='UL') {
        let main = createList(mode);
        let li = document.createElement('LI');
        main.append(li);

        const restoreCursor = preserveCursor();
        while (this.firstChild) {
            li.append(this.firstChild);
        }
        this.after(main);
        this.remove();

        restoreCursor(new Map([[this, li]]));
        return true;
    };


    HTMLLIElement.prototype.oToggleList = function (offset, mode) {
        let pnode = this.closest('ul, ol');
        if (!pnode) return;
        const restoreCursor = preserveCursor();
        switch (getListMode(pnode)+mode) {
            case 'OLCL':
            case 'ULCL':
                pnode.classList.add('checklist');
                for (let li=pnode.firstElementChild; li!==null; li=li.nextElementSibling) {
                    if (li.style.listStyle != "none") {
                        li.style.listStyle = null;
                        if (!li.style.all)
                            li.removeAttribute("style");
                    }
                }
                setTagName(pnode, 'UL');
                break;
            case 'CLOL':
            case 'CLUL':
                toggleClass(pnode, "checklist");
            case 'OLUL':
            case 'ULOL':
                setTagName(pnode, mode);
                break;
            default:
                // toggle => remove list
                let node = this;
                while (node) {
                    node = node.oShiftTab(offset);
                }
        }
        restoreCursor();
        return false;
    };

    function areSimilarElements(node, node2) {
        if (!node || !node2 || node.nodeType !== Node.ELEMENT_NODE || node2.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }
        if (node.tagName !== node2.tagName) {
            return false;
        }
        for (const att of node.attributes) {
            const att2 = node2.attributes[att.name];
            if ((att2 && att2.value) !== att.value) {
                return false;
            }
        }
        for (const att of node2.attributes) {
            const att2 = node.attributes[att.name];
            if ((att2 && att2.value) !== att.value) {
                return false;
            }
        }
        function isNotNoneValue(value) {
            return value && value !== 'none';
        }
        if (isNotNoneValue(getComputedStyle(node, ':before').getPropertyValue('content'))
                || isNotNoneValue(getComputedStyle(node, ':after').getPropertyValue('content'))
                || isNotNoneValue(getComputedStyle(node2, ':before').getPropertyValue('content'))
                || isNotNoneValue(getComputedStyle(node2, ':after').getPropertyValue('content'))) {
            return false;
        }
        if ((node.tagName=='LI') && (node.classList.contains('nested'))) {
            return node.lastElementChild && node2.firstElementChild && getListMode(node.lastElementChild) == getListMode(node2.firstElementChild);
        }
        return (['UL', 'OL'].includes(node.tagName) || !isBlock(node)) && !isVisibleEmpty(node) && !isVisibleEmpty(node2);
    }


    class Sanitize {
        constructor(root) {
            this.root = root;
            this.parse(root);
        }

        parse(node) {
            node = closestBlock(node);
            if (['UL', 'OL'].includes(node.tagName)) {
                node = node.parentElement;
            }
            this._parse(node);
        }

        _parse(node) {
            if (!node) {
                return;
            }

            // Merge identical elements together
            while (areSimilarElements(node, node.previousSibling)) {
                let restoreCursor = preserveCursor();
                let nodeP = node.previousSibling;
                moveNodes(...endPos(node.previousSibling), node);
                restoreCursor();
                node = nodeP;
            }

            // Remove empty blocks in <li>
            if (node.nodeName=='P' && node.parentElement.tagName=='LI') {
                let next = node.nextSibling;
                let pnode = node.parentElement;
                if (isEmptyBlock(node)) {
                    let restoreCursor = preserveCursor();
                    node.remove();
                    fillEmpty(pnode);
                    this._parse(next);
                    restoreCursor(new Map([[node, pnode]]));
                    return;
                }
            }

            // FIXME not parse out of editable zone...
            this._parse(node.firstChild);
            this._parse(node.nextSibling);
        }
    }

    function sanitize(root) {
        new Sanitize(root);
        return root;
    }

    // TODO: avoid empty keys when not necessary to reduce request size
    function nodeToObject(node) {
        let result = {
           nodeType: node.nodeType,
           oid: node.oid,
        };
        if (!node.oid) {
            console.warn('OID can not be falsy!');
        }
        if (node.nodeType === Node.TEXT_NODE) {
            result.textValue = node.nodeValue;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            result.tagName = node.tagName;
            result.children = [];
            result.attributes = {};
            for (let i = 0; i < node.attributes.length; i++) {
                result.attributes[node.attributes[i].name] = node.attributes[i].value;
            }
            let child = node.firstChild;
            while (child) {
                result.children.push(nodeToObject(child));
                child = child.nextSibling;
            }
        }
        return result;
    }

    function objectToNode(obj) {
        let result = undefined;
        if (obj.nodeType === Node.TEXT_NODE) {
            result = document.createTextNode(obj.textValue);
        } else if (obj.nodeType === Node.ELEMENT_NODE) {
            result = document.createElement(obj.tagName);
            for (let key in obj.attributes) {
                result.setAttribute(key, obj.attributes[key]);
            }
            obj.children.forEach(child => result.append(objectToNode(child)));
        } else {
            console.warn('unknown node type');
        }
        result.oid = obj.oid;
        return result;
    }

    const UNBREAKABLE_ROLLBACK_CODE = 100;
    const BACKSPACE_ONLY_COMMANDS = ['oDeleteBackward', 'oDeleteForward'];
    const BACKSPACE_FIRST_COMMANDS = BACKSPACE_ONLY_COMMANDS.concat(['oEnter', 'oShiftEnter']);

    class OdooEditor {
        constructor(dom, options = {}) {
            this.options = options;

            if (typeof this.options.toSanitize === 'undefined') {
                this.options.toSanitize = true;
            }
            if (typeof this.options.toolbar === 'undefined') {
                this.options.toolbar = false;
            }

            dom.oid = 1;                                      // convention: root node is ID 1
            this.dom = this.options.toSanitize ? sanitize(dom) : dom;
            this.history = [{
                cursor: { // cursor at beginning of step
                    anchorNode: undefined, anchorOffset: undefined,
                    focusNode: undefined, focusOffset: undefined,
                },
                dom: [],
                id: undefined
            }];
            this.undos = new Map();

            // set contentEditable before clone as FF updates the content at this point
            dom.setAttribute("contentEditable", true);
            this.vdom = dom.cloneNode(true);
            this.vdom.removeAttribute("contentEditable");
            this.idSet(dom, this.vdom);

            this.observerActive();

            this.dom.addEventListener('keydown', this._onKeyDown.bind(this));
            this.dom.addEventListener('input', this._onInput.bind(this));
            this.dom.addEventListener('mousedown', this._onClick.bind(this));

            document.onselectionchange = this._onSelectionChange.bind(this);
            document.onclick = this._onSelectionChange.bind(this);

            if (this.options.toolbar) {
                this.toolbar = document.querySelector('#toolbar');
                this.toolbar.addEventListener('mousedown', this._onToolbarClick.bind(this));
            }

            this.collaborate = false;
            this.collaborate_last = null;

            // used to check if we have to rollback an operation as an unbreakable is
            this.torollback = false; // unbreakable removed or added
        }
        /**
         * Releases anything that was initialized.
         *
         * TODO: properly implement this.
         */
        destroy() {
            this.observerUnactive();
        }

        sanitize() {
            this.observerFlush();

            // find common ancestror in this.history[-1]
            let step = this.history[this.history.length - 1];
            let ca, record;
            for (record of step.dom) {
                let node = this.idFind(this.dom, record.parentId || record.id) || this.dom;
                ca = ca ? commonParentGet(ca, node, this.dom) : node;
            }
            if (!ca) {
                return false;
            }

            // sanitize and mark current position as sanitized
            sanitize(ca);
        }

        // Assign IDs to src, and dest if defined
        idSet(src, dest = undefined, testunbreak=false) {
            if (!src.oid) {
                src.oid = Math.random() * 2 ** 31 | 0; // TODO: uuid4 or higher number
            }
            // rollback if src.ouid changed
            src.ouid ||= getOuid(src, true);
            if (testunbreak) {
                const ouid = getOuid(src);
                this.torollback ||= ouid && (ouid != src.ouid);
            }

            if (dest && !dest.oid) {
                dest.oid = src.oid;
            }
            let childsrc = src.firstChild;
            let childdest = dest ? dest.firstChild : undefined;
            while (childsrc) {
                this.idSet(childsrc, childdest, testunbreak);
                childsrc = childsrc.nextSibling;
                childdest = dest ? childdest.nextSibling : undefined;
            }
        }

        // TODO: improve to avoid traversing the whole DOM just to find a node of an ID
        idFind(dom, id, parentid) {
            if (dom.oid === id && (!parentid || dom.parentNode.oid === parentid)) {
                return dom;
            }
            let cur = dom.firstChild;
            while (cur) {
                let result = this.idFind(cur, id, parentid);
                if (result) {
                    return result;
                }
                cur = cur.nextSibling;
            }
        }

        // Observer that syncs doms

        // if not in collaboration mode, no need to serialize / unserialize
        serialize(node) {
            return this.collaborate ? nodeToObject(node) : node;
        }
        unserialize(obj) {
            return this.collaborate ? objectToNode(obj) : obj;
        }

        observerUnactive() {
            this.observer.disconnect();
            this.observerFlush();
        }
        observerFlush() {
            let records = this.observer.takeRecords();
            this.observerApply(this.vdom, records);
        }
        observerActive() {
            this.observer = new MutationObserver(records => {
                this.observerApply(this.vdom, records);
            });
            this.observer.observe(this.dom, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true,
                characterDataOldValue: true,
            });
        }

        observerApply(destel, records) {
            for (let record of records) {
                switch (record.type) {
                    case "characterData": {
                        this.history[this.history.length - 1].dom.push({
                            'type': "characterData",
                            'id': record.target.oid,
                            "text": record.target.textContent,
                            "oldValue": record.oldValue,
                        });
                        break;
                    }
                    case "attributes": {
                        this.history[this.history.length - 1].dom.push({
                            'type': "attributes",
                            'id': record.target.oid,
                            "attributeName": record.attributeName,
                            "value": record.target.getAttribute(record.attributeName),
                            "oldValue": record.oldValue,
                        });
                        break;
                    }
                    case "childList": {
                        record.addedNodes.forEach((added, index) => {
                            this.torollback |= containsUnbreakable(added);
                            let action = {
                                'type': "add",
                            };
                            if (!record.nextSibling && record.target.oid) {
                                action['append'] = record.target.oid;
                            } else if (record.nextSibling.oid) {
                                action['before'] = record.nextSibling.oid;
                            } else if (record.previousSibling.oid) {
                                action['after'] = record.previousSibling.oid;
                            } else {
                                return false;
                            }
                            this.idSet(added, undefined, true);
                            action['id'] = added.oid;
                            action['node'] = this.serialize(added);
                            this.history[this.history.length - 1].dom.push(action);
                        });
                        record.removedNodes.forEach((removed, index) => {
                            this.history[this.history.length - 1].dom.push({
                                'type': "remove",
                                'id': removed.oid,
                                'parentId': record.target.oid,
                                'node': this.serialize(removed),
                                'nextId': record.nextSibling ? record.nextSibling.oid : undefined,
                                'previousId': record.previousSibling ? record.previousSibling.oid : undefined,
                            });
                        });
                        break;
                    }
                }
            }
        }

        //
        // History
        //

        // One step completed: apply to vDOM, setup next history step
        historyStep() {
            this.observerFlush();
            // check that not two unBreakables modified
            if (this.torollback) {
                this.historyRollback();
                this.torollback = false;
            }

            // push history
            let latest = this.history[this.history.length - 1];
            if (!latest.dom.length) {
                return false;
            }

            latest.id = Math.random() * 2 ** 31 | 0; // TODO: replace by uuid4 generator
            this.historyApply(this.vdom, latest.dom);
            this.historySend(latest);
            this.history.push({
                cursor: {},
                dom: [],
            });
            this._recordHistoryCursor();
        }

        // apply changes according to some records
        historyApply(destel, records) {
            for (let record of records) {
                if (record.type === 'characterData') {
                    let node = this.idFind(destel, record.id);
                    if (node) {
                        node.textContent = record.text;
                    }
                } else if (record.type === "attributes") {
                    let node = this.idFind(destel, record.id);
                    if (node) {
                        node.setAttribute(record.attributeName, record.value);
                    }
                } else if (record.type === "remove") {
                    let toremove = this.idFind(destel, record.id, record.parentId);
                    if (toremove) {
                        toremove.remove();
                    }
                } else if (record.type === "add") {
                    let node = this.unserialize(record.node);
                    let newnode = node.cloneNode(1);
                    // preserve oid after the clone
                    this.idSet(node, newnode);

                    let destnode = this.idFind(destel, record.node.oid);
                    if (destnode && (record.node.parentNode.oid === destnode.parentNode.oid)) {
                        // TODO: optimization: remove record from the history to reduce collaboration bandwidth
                        continue;
                    }
                    if (record.append && this.idFind(destel, record.append)) {
                        this.idFind(destel, record.append).append(newnode);
                    } else if (record.before && this.idFind(destel, record.before)) {
                        this.idFind(destel, record.before).before(newnode);
                    } else if (record.after && this.idFind(destel, record.after)) {
                        this.idFind(destel, record.after).after(newnode);
                    } else {
                        continue;
                    }
                }
            }
        }


        // send changes to server
        historyFetch() {
            if (!this.collaborate) {
                return;
            }
            window.fetch(`/history-get/${this.collaborate_last || 0}`, {
                headers: {'Content-Type': 'application/json;charset=utf-8'},
                method: 'GET',
            }).then(response => {
                if (!response.ok) {
                    return Promise.reject();
                }
                return response.json();
            }).then(result => {
                if (!result.length) {
                    return false;
                }
                this.observerUnactive();

                let index = this.history.length;
                let updated = false;
                while (index && (this.history[index - 1].id !== this.collaborate_last)) {
                    index--;
                }

                for (let residx = 0; residx < result.length; residx++) {
                    let record = result[residx];
                    this.collaborate_last = record.id;
                    if (index < this.history.length && record.id === this.history[index].id) {
                        index++;
                        continue;
                    }
                    updated = true;

                    // we are not synched with the server anymore, rollback and replay
                    while (this.history.length > index) {
                        this.historyRollback();
                        this.history.pop();
                    }

                    if (record.id === 1) {
                        this.dom.innerHTML = '';
                        this.vdom.innerHTML = '';
                    }
                    this.historyApply(this.dom, record.dom);
                    this.historyApply(this.vdom, record.dom);

                    record.dom = record.id === 1 ? [] : record.dom;
                    this.history.push(record);
                    index++;
                }
                if (updated) {
                    this.history.push({
                        cursor: {},
                        dom: [],
                    });
                }
                this.observerActive();
                this.historyFetch();
            }).catch(err => {
                // TODO: change that. currently: if error on fetch, fault back to non collaborative mode.
                this.collaborate = false;
            });
        }

        historySend(item) {
            if (!this.collaborate) {
                return;
            }
            window.fetch('/history-push', {
                body: JSON.stringify(item),
                headers: {'Content-Type': 'application/json;charset=utf-8'},
                method: 'POST',
            }).then(response => {
                console.log(response);
            });
        }

        historyRollback(until = 0) {
            const hist = this.history[this.history.length - 1];
            this.observerFlush();
            this.historyRevert(hist, until);
            this.observerFlush();
            hist.dom = hist.dom.slice(0, until);
            this.torollback = false;
        }

        historyUndo() {
            let pos = this.history.length - 2;
            while (this.undos.has(pos)) {
                pos = this.undos.get(pos) - 1;
            }
            if (pos < 0) {
                return true;
            }
            this.undos.delete(this.history.length - 2);
            this.historyRevert(this.history[pos]);
            this.undos.set(this.history.length - 1, pos);
            this.historyStep();
        }

        historyRedo() {
            this.historyStep();
            let pos = this.history.length - 2;
            if (this.undos.has(pos)) {
                this.historyApply(this.dom, this.history[this.undos.get(pos)].dom);
                let step = this.history[this.undos.get(pos) + 1];
                this.historySetCursor(step);
                this.undos.set(pos + 1, this.undos.get(pos) + 1);
                this.undos.delete(pos);
            }
        }

        historyRevert(step, until = 0) {
            // apply dom changes by reverting history steps
            for (let i = step.dom.length - 1; i >= until; i--) {
                let action = step.dom[i];
                if (!action) {
                    break;
                }
                switch (action.type) {
                    case "characterData": {
                        this.idFind(this.dom, action.id).textContent = action.oldValue;
                        break;
                    }
                    case "attributes": {
                        this.idFind(this.dom, action.id).setAttribute(action.attributeName, action.oldValue);
                        break;
                    }
                    case "remove": {
                        let node = this.unserialize(action.node);
                        if (action.nextId && this.idFind(this.dom, action.nextId)) {
                            this.idFind(this.dom, action.nextId).before(node);
                        } else if (action.previousId && this.idFind(this.dom, action.previousId)) {
                            this.idFind(this.dom, action.previousId).after(node);
                        } else {
                            this.idFind(this.dom, action.parentId).append(node);
                        }
                        break;
                    }
                    case "add": {
                        let el = this.idFind(this.dom, action.id);
                        if (el) {
                            el.remove();
                        }
                    }
                }
            }
            this.historySetCursor(step);
        }

        historySetCursor(step) {
            if (step.cursor.anchorNode) {
                const anchorNode = this.idFind(this.dom, step.cursor.anchorNode);
                const focusNode = step.cursor.focusNode ? this.idFind(this.dom, step.cursor.focusNode) : anchorNode;
                if (anchorNode) {
                    setCursor(
                        anchorNode,
                        step.cursor.anchorOffset,
                        focusNode,
                        step.cursor.focusOffset !== undefined ? step.cursor.focusOffset : step.cursor.anchorOffset,
                        false
                    );
                }
            }
        }

        /**
         * Same as @see _applyCommand, except that also simulates all the
         * contenteditable behaviors we let happen, e.g. the backspace handling
         * we then rollback.
         *
         * TODO this uses document.execCommand (which is deprecated) and relies on
         * the fact that using a command through it leads to the same result as
         * executing that command through a user keyboard on the unaltered editable
         * section with standard contenteditable attribute. This is already a huge
         * assomption.
         *
         * @param {string} method
         * @returns {?}
         */
        execCommand(method) {
            this._computeHistoryCursor();
            return this._applyCommand(...arguments);
        }

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        // EDITOR COMMANDS
        // ===============

        deleteRange(sel) {
            const range = sel.getRangeAt(0);
            let pos1 = [range.startContainer, range.startOffset];
            let pos2 = [range.endContainer, range.endOffset];
            // A selection spanning multiple nodes and ending at position 0 of a
            // node, like the one resulting from a triple click, are corrected so
            // that it ends at the last position of the previous node instead.
            if (!pos2[1]) {
                pos2 = rightPos(leftDeepOnlyPath(...pos2).next().value);
            }

            // Hack: we will follow the logic "do many backspace until the
            // selection is collapsed". The problem is that after one backspace
            // the node the starting position of the cursor is in may have
            // changed (split, removed, moved, etc) so there is no reliable
            // way to know when there has been enough backspaces... except for
            // this hack: we put a fake element acting as a one-space-to-remove
            // element (like an image) at the selection start position and we
            // hit backspace until that element is removed.
            if (pos1[0].nodeType === Node.TEXT_NODE) {
                // First, if the selection start is in a text node, we have to
                // split that text node to be able to put the fake element
                // in-between.
                const splitNode = pos1[0];
                const splitOffset = pos1[1];
                const willActuallySplitPos2 = (pos2[0] === splitNode && splitOffset > 0 && splitOffset < splitNode.length);
                pos1 = [splitNode.parentNode, splitTextNode(splitNode, splitOffset)];
                if (willActuallySplitPos2) {
                    if (pos2[1] < splitOffset) {
                        pos2[0] = splitNode.previousSibling;
                    } else {
                        pos2[1] -= splitOffset;
                    }
                }
            }
            // Then we add the fake element. However to add it properly without
            // risking breaking the DOM states, we still have to prepareUpdate
            // and restore here.
            const restore = prepareUpdate(...pos1);
            const fakeEl = document.createElement('img');
            if (pos1[1] >= pos1[0].childNodes.length) {
                pos1[0].appendChild(fakeEl);
            } else {
                pos1[0].insertBefore(fakeEl, pos1[0].childNodes[pos1[1]]);
            }
            if (pos1[0] === pos2[0] && pos2[1] > pos1[1]) {
                // Update first backspace position offset if it was relative
                // to the same element the fake element has been put in.
                pos2[1]++;
            }
            restore();
            // Check pos2 still make sense as the restoreState may have broken
            // it, if that is is the case, set it just after the fake element.
            if (!pos2[0].parentNode || pos2[1] > nodeSize(pos2[0])) {
                pos2 = rightPos(fakeEl);
            }
            let gen;
            do {
                const histPos = this.history[this.history.length - 1].dom.length;
                const err = this._protectUnbreakable(() => {
                    pos2[0].oDeleteBackward(pos2[1]);
                    gen = undefined;
                }, histPos);
                if (err === UNBREAKABLE_ROLLBACK_CODE) {
                    gen = gen || leftDeepOnlyPath(...pos2);
                    pos2 = rightPos(gen.next().value);
                    continue;
                }

                sel = document.defaultView.getSelection();
                pos2 = [sel.anchorNode, sel.anchorOffset];
            } while (fakeEl.parentNode);
        }

        _createLink(link="#", content) {
            const sel = document.defaultView.getSelection();
            if (content && !sel.isCollapsed) {
                this.deleteRange(sel);
            }
            if (sel.isCollapsed) {
                insertText(sel, content || 'link');
            }
            if (document.execCommand('createLink', false, '#')) {
                const node = findNode(closestPath(sel.focusNode), node => node.tagName === "A");
                let pos = [node.parentElement, childNodeIndex(node)+1];
                setCursor(...pos, ...pos, false);
            }
        }

        _unLink(offset, content) {
            const sel = document.defaultView.getSelection();
            if (sel.isCollapsed) {
                const cr = preserveCursor();
                const node = findNode(closestPath(sel.anchorNode), node => node.tagName === "A");
                setCursor(node, 0, node, node.childNodes.length, false);
                document.execCommand('unlink');
                cr();
            } else {
                document.execCommand('unlink');
            }
        }

        _indentList(mode='indent') {
            let [pos1, pos2] = getCursors();
            let end = leftDeepFirstPath(...pos1).next().value;
            let li = new Set();
            for (let node of leftDeepFirstPath(...pos2)) {
                let cli = closestBlock(node);
                if ((cli?.tagName=='LI') && !li.has(cli) && !cli.classList.contains('nested')) {
                    li.add(cli);
                }
                if (node==end) break;
            }
            for (let node of li) {
                if (mode=='indent') {
                    node.oTab(0);
                } else {
                    node.oShiftTab(0);
                }
            }
            return true;
        }

        _toggleList(mode) {
            let sel = document.defaultView.getSelection();
            let end = leftDeepFirstPath(sel.anchorNode, sel.anchorOffset).next().value;

            let li = new Set();
            let blocks = new Set();


            for (let node of leftDeepFirstPath(sel.focusNode, sel.focusOffset)) {
                let block = closestBlock(node);
                if (!['OL','UL'].includes(block.tagName)) {
                    let ublock = block.closest('ol, ul');
                    (ublock && getListMode(ublock) == mode) ? li.add(block) : blocks.add(block);
                }
                if (node==end) break;
            }

            let target = [...((blocks.size) ? blocks : li)];
            while (target.length) {
                let node = target.pop();
                // only apply one li per ul
                if (! node.oToggleList(0, mode)) {
                    target = target.filter(li => (li.parentNode != node.parentNode) || (li.tagName != 'LI'));
                }        }
        }


        /**
         * Applies the given command to the current selection. This does *NOT*:
         * 1) update the history cursor
         * 2) protect the unbreakables
         * 3) sanitize the result
         * 4) create new history entry
         * 5) follow the exact same operations that would be done following events
         *    that would lead to that command
         *
         * For points 1 -> 4, @see _applyCommand
         * For points 1 -> 5, @see execCommand
         *
         * @private
         * @param {string} method
         * @returns {?}
         */
        _applyRawCommand(method, ...args) {
            let sel = document.defaultView.getSelection();
            if (!sel.isCollapsed && BACKSPACE_FIRST_COMMANDS.includes(method)) {
                this.deleteRange(sel);
                if (BACKSPACE_ONLY_COMMANDS.includes(method)) {
                    return true;
                }
            }
            if (['toggleList', 'createLink', 'unLink', 'indentList'].includes(method)) {
                return this['_'+method](...args);
            }
            if (method.startsWith('justify')) {
                return document.execCommand(method, false, '');
            }
            return sel.anchorNode[method](sel.anchorOffset, ...args);
        }

        /**
         * Same as @see _applyRawCommand but adapt history, protects unbreakables
         * and sanitizes the result.
         *
         * @private
         * @param {string} method
         * @returns {?}
         */
        _applyCommand(method) {
            this._recordHistoryCursor(true);
            const result = this._protectUnbreakable(() => this._applyRawCommand(...arguments));
            this.sanitize();
            this.historyStep();
            return result;
        }
        /**
         * @private
         * @param {function} callback
         * @param {number} [rollbackCounter]
         * @returns {?}
         */
        _protectUnbreakable(callback, rollbackCounter) {
            try {
                let result = callback.call(this);
                this.observerFlush();
                if (!this.torollback) {
                    return result;
                }
            } catch (err) {
                if (err !== UNBREAKABLE_ROLLBACK_CODE) {
                    throw err;
                }
            }
            this.historyRollback(rollbackCounter);
            return UNBREAKABLE_ROLLBACK_CODE;
        }

        // HISTORY
        // =======

        /**
         * @private
         * @returns {Object}
         */
        _computeHistoryCursor() {
            const sel = document.defaultView.getSelection();
            if (!sel.anchorNode) {
                return this._latestComputedCursor;
            }
            this._latestComputedCursor = {
                anchorNode: sel.anchorNode.oid,
                anchorOffset: sel.anchorOffset,
                focusNode: sel.focusNode.oid,
                focusOffset: sel.focusOffset,
            };
            return this._latestComputedCursor;
        }
        /**
         * @private
         * @param {boolean} [useCache=false]
         */
        _recordHistoryCursor(useCache = false) {
            const latest = this.history[this.history.length - 1];
            latest.cursor = useCache ? this._latestComputedCursor : this._computeHistoryCursor();
        }

        // TOOLBAR
        // =======

        /**
         * @private
         * @param {boolean} [show]
         */
        _updateToolbar(show) {
            if (!this.options.toolbar) return;

            let sel = document.defaultView.getSelection();
            if (!sel.anchorNode) {
                show = false;
            }
            if (show !== undefined) {
                this.toolbar.style.visibility = show ? 'visible' : 'hidden';
            }
            if (show === false) {
                return;
            }
            for (let commandState of ["bold", "italic", "underline", "strikeThrough", "justifyLeft", "justifyRight", "justifyCenter", "justifyFull"]) {
                this.toolbar.querySelector('#'+commandState).classList.toggle('active', document.queryCommandState(commandState));
            }
            let pnode = closestBlock(sel.anchorNode);
            this.toolbar.querySelector('#paragraph').classList.toggle('active', pnode.tagName === 'P');
            this.toolbar.querySelector('#heading1').classList.toggle('active', pnode.tagName === 'H1');
            this.toolbar.querySelector('#heading2').classList.toggle('active', pnode.tagName === 'H2');
            this.toolbar.querySelector('#heading3').classList.toggle('active', pnode.tagName === 'H3');
            this.toolbar.querySelector('#blockquote').classList.toggle('active', pnode.tagName === 'BLOCKQUOTE');
            this.toolbar.querySelector('#unordered').classList.toggle('active', (pnode.tagName === 'LI') && (getListMode(pnode.parentElement) === "UL"));
            this.toolbar.querySelector('#ordered').classList.toggle('active', (pnode.tagName === 'LI') && (getListMode(pnode.parentElement) === "OL"));
            this.toolbar.querySelector('#checklist').classList.toggle('active', (pnode.tagName === 'LI') && (getListMode(pnode.parentElement) === "CL"));
            const linkNode = findNode(closestPath(sel.anchorNode), node => node.tagName === "A");
            this.toolbar.querySelector('#createLink').classList.toggle('active', linkNode);
            this.toolbar.querySelector('#unLink').classList.toggle('active', linkNode);
        }

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * If backspace/delete input, rollback the operation and handle the
         * operation ourself. Needed for mobile, used for desktop for consistency.
         *
         * @private
         */
        _onInput(ev) {
            // Record the cursor position that was computed on keydown or before
            // contentEditable execCommand (whatever preceded the 'input' event)
            this._recordHistoryCursor(true);

            if (ev.inputType === 'deleteContentBackward') {
                this.historyRollback();
                ev.preventDefault();
                this._applyCommand('oDeleteBackward');
            } else if (ev.inputType === 'deleteContentForward') {
                this.historyRollback();
                ev.preventDefault();
                this._applyCommand('oDeleteForward');
            } else {
                this.sanitize();
                this.historyStep();
            }
        }

        /**
         * @private
         */
        _onKeyDown(ev) {
            // Compute the current cursor on keydown but do not record it. Leave
            // that to the command execution or the 'input' event handler.
            this._computeHistoryCursor();
            // If the pressed key has a printed representation, the returned value
            // is a non-empty Unicode character string containing the printable
            // representation of the key. In this case, call `deleteRange` before
            // inserting the printed representation of the character.
            if (/^.$/u.test(ev.key)) {
                const selection = document.defaultView.getSelection();
                if (selection && !selection.isCollapsed) {
                    this.deleteRange(selection);
                }
            }
            if (ev.keyCode === 13) { // Enter
                ev.preventDefault();
                if (ev.shiftKey || this._applyCommand('oEnter') === UNBREAKABLE_ROLLBACK_CODE) {
                    this._applyCommand('oShiftEnter');
                }
            } else if (ev.keyCode === 9) { // Tab
                if (this._applyCommand('indentList', ev.shiftKey ? 'outdent' : 'indent')) {
                    ev.preventDefault();
                }
            } else if (ev.key === 'z' && ev.ctrlKey) { // Ctrl-Z
                ev.preventDefault();
                this.historyUndo();
            } else if (ev.key === 'y' && ev.ctrlKey) { // Ctrl-Y
                ev.preventDefault();
                this.historyRedo();
            }
        }
        /**
         * @private
         */
        _onSelectionChange() {
            const sel = document.defaultView.getSelection();
            this._updateToolbar(!sel.isCollapsed);
        }

        _onClick(ev) {
            let node = ev.target;
            // handle checkbox lists
            if (node.tagName == 'LI' && getListMode(node.parentElement)=='CL') {
                if (ev.layerX < 0 && ev.layerY <= 16) {
                    node.classList.remove('unchecked');
                    toggleClass(node, 'checked');
                    ev.preventDefault();
                }
            }
        }

        _onToolbarClick(ev) {
            const buttonEl = ev.target.closest('div.btn');
            if (!buttonEl) {
                return;
            }

            const TAGS = {
                'paragraph': 'P',
                'heading1': 'H1',
                'heading2': 'H2',
                'heading3': 'H3',
                'blockquote': 'BLOCKQUOTE',
                'ordered': 'OL',
                'unordered': 'UL',
                'checklist': 'CL'
            };
            ev.preventDefault();
            this._protectUnbreakable(() => {
                if (['bold', 'italic', 'underline', 'strikeThrough'].includes(buttonEl.id)) {
                    document.execCommand(buttonEl.id);
                } else if (['fontColor'].includes(buttonEl.id)) {
                    document.execCommand('styleWithCSS', false, true);
                    document.execCommand('foreColor', false, "red");
                } else if (['createLink', 'unLink'].includes(buttonEl.id)) {
                    this.execCommand(buttonEl.id);
                } else if (['ordered', 'unordered', 'checklist'].includes(buttonEl.id)) {
                    this.execCommand('toggleList', TAGS[buttonEl.id]);
                } else if (buttonEl.id.startsWith('justify')) {
                    this.execCommand(buttonEl.id);
                } else {
                    let sel = document.defaultView.getSelection();
                    let pnode = closestBlock(sel.anchorNode);
                    setTagName(pnode, TAGS[buttonEl.id]);
                    setCursor(sel.anchorNode, sel.anchorOffset);
                }
                this.historyStep();
                this._updateToolbar();
            });
        }
    }

    exports.BACKSPACE_FIRST_COMMANDS = BACKSPACE_FIRST_COMMANDS;
    exports.BACKSPACE_ONLY_COMMANDS = BACKSPACE_ONLY_COMMANDS;
    exports.OdooEditor = OdooEditor;
    exports.UNBREAKABLE_ROLLBACK_CODE = UNBREAKABLE_ROLLBACK_CODE;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

}({}));
return exportVariable;
}));
