/** @odoo-module **/

export function parseHTML(document, html) {
    const fragment = document.createDocumentFragment();
    const parser = new document.defaultView.DOMParser();
    const parsedDocument = parser.parseFromString(html, "text/html");
    fragment.replaceChildren(...parsedDocument.body.childNodes);
    return fragment;
}
