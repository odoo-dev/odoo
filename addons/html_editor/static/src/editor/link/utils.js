/**
 * @param {string} [value]
 * @returns {boolean}
 */
export function isColorGradient(value) {
    // FIXME duplicated in odoo-editor/utils.js also in color plugin
    return value && value.includes('-gradient(');
}

/**
 * Returns the label of a link element.
 *
 * @param {HTMLElement} linkEl
 * @returns {string}
 */
export function getLinkLabel(linkEl) {
    return linkEl.innerText.trim().replaceAll("\u200B", "");
}

/**
* Returns a complete URL if text is a valid email address, http URL or telephone
* number, null otherwise.
* The optional link parameter is used to prevent protocol switching between
* 'http' and 'https'.
*
* @param {String} text
* @param {HTMLAnchorElement} [link]
* @returns {String|null}
*/
export function deduceURLfromText(text, link) {
    const label = text.replace(/\u200b/g, '').trim();
    // Check first for e-mail.
    let match = label.match(EMAIL_REGEX);
    if (match) {
        return match[1] ? match[0] : 'mailto:' + match[0];
    }
    // Check for http link.
    match = label.match(URL_REGEX);
    if (match && match[0] === label) {
        const currentHttpProtocol = (link?.href.match(/^http(s)?:\/\//gi) || [])[0];
        if (match[2]) {
            return match[0];
        } else if (currentHttpProtocol) {
            // Avoid converting a http link to https.
            return currentHttpProtocol + match[0];
        } else {
            return 'http://' + match[0];
        }
    }
    // Check for telephone url.
    match = label.match(PHONE_REGEX);
    if (match) {
        return match[1] ? match[0] : 'tel://' + match[0];
    }
    return null;
 }

 /**
 * Return the link element to edit. Create one from selection if none was
 * present in selection.
 *
 * @param {Node} [options.containerNode]
 * @param {Node} [options.startNode]
 * @returns {Object}
 */
export function getOrCreateLink({ containerNode, startNode } = {}) {
    if (startNode) {
        if ($(startNode).is('a')) {
            return { link: startNode, needLabel: false };
        } else {
            $(startNode).wrap('<a href="#"/>');
            return { link: startNode.parentElement, needLabel: false };
        }
    }

    const doc = containerNode && containerNode.ownerDocument || document;
    let needLabel = false;
    let link = getInSelection(doc, 'a');
    const $link = $(link);
    const range = getDeepRange(containerNode, {splitText: true, select: true, correctTripleClick: true});
    if (!range) {
        return {};
    }
    const isContained = containerNode.contains(range.startContainer) && containerNode.contains(range.endContainer);
    if (link && (!$link.has(range.startContainer).length || !$link.has(range.endContainer).length)) {
        // Expand the current link to include the whole selection.
        let before = link.previousSibling;
        while (before !== null && range.intersectsNode(before)) {
            link.insertBefore(before, link.firstChild);
            before = link.previousSibling;
        }
        let after = link.nextSibling;
        while (after !== null && range.intersectsNode(after)) {
            link.appendChild(after);
            after = link.nextSibling;
        }
    } else if (!link && isContained) {
        link = document.createElement('a');
        if (range.collapsed) {
            range.insertNode(link);
            needLabel = true;
        } else {
            link.appendChild(range.extractContents());
            range.insertNode(link);
        }
    }
    return { link, needLabel };
};
