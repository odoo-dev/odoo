/** @odoo-module alias=mail.utils.stripHTML **/

export default function stripHTML(node, transformChildren) {
    if (node.nodeType === 3) return node.data;  // text node
    if (node.tagName === "BR") return "\n";
    return transformChildren();
}
