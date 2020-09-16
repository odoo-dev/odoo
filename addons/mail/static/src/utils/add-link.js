/** @odoo-module alias=mail.utils.addLink **/

import linkify from 'mail.utils.linkify';

export default function addLink(node, transformChildren) {
    if (node.nodeType === 3) {  // text node
        const linkified = linkify(node.data);
        if (linkified !== node.data) {
            const div = document.createElement('div');
            div.innerHTML = linkified;
            for (const childNode of [...div.childNodes]) {
                node.parentNode.insertBefore(childNode, node);
            }
            node.parentNode.removeChild(node);
            return linkified;
        }
        return node.textContent;
    }
    if (node.tagName === "A") return node.outerHTML;
    transformChildren();
    return node.outerHTML;
}
