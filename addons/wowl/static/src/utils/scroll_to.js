/** @odoo-module */

/**
 * Ensures that `element` will be visible in its `scrollable`.
 *
 * @param {HTMLElement} element
 * @param {HTMLElement} scrollable
 */
export function scrollTo(element, scrollable) {
  // Scrollbar is present ?
  if (scrollable.scrollHeight > scrollable.clientHeight) {
    const scrollBottom = scrollable.clientHeight + scrollable.scrollTop;
    const elementBottom = element.offsetTop + element.offsetHeight;
    if (elementBottom > scrollBottom) {
      // Scroll down
      scrollable.scrollTop = elementBottom - scrollable.clientHeight;
    } else if (element.offsetTop < scrollable.scrollTop) {
      // Scroll up
      scrollable.scrollTop = element.offsetTop;
    }
  }
}
