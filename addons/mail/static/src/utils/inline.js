/** @odoo-module alias=mail.utils.inline **/

export default function inline(node, transform_children) {
    if (node.nodeType === 3) return node.data;
    if (node.nodeType === 8) return "";
    if (node.tagName === "BR") return " ";
    if (node.tagName.match(/^(A|P|DIV|PRE|BLOCKQUOTE)$/)) return transform_children();
    node.innerHTML = transform_children();
    return node.outerHTML;
}
