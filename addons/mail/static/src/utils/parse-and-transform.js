/** @odoo-module alias=mail.utils.htmlToTextContentInline **/

/**
 * @param {string} htmlString
 * @return {string}
 */
export default function htmlToTextContentInline(htmlString) {
    const fragment = document.createDocumentFragment();
    const div = document.createElement('div');
    fragment.appendChild(div);
    htmlString = htmlString.replace(/<br\s*\/?>/gi,' ');
    try {
        div.innerHTML = htmlString;
    } catch (e) {
        div.innerHTML = `<pre>${htmlString}</pre>`;
    }
    return div
        .textContent
        .trim()
        .replace(/[\n\r]/g, '')
        .replace(/\s\s+/g, ' ');
}
