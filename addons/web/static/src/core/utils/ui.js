/** @odoo-module **/

/**
 * @param {Element} activeElement
 * @param {String} selector
 * @returns all selected and visible elements present in the activeElement
 */
export function getVisibleElements(activeElement, selector) {
    const visibleElements = [];
    /** @type {NodeListOf<HTMLElement>} */
    const elements = activeElement.querySelectorAll(selector);
    for (const el of elements) {
        const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
        if (isVisible) {
            visibleElements.push(el);
        }
    }
    return visibleElements;
}
