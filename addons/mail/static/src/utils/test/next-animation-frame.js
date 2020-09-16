/** @odoo-module alias=mail.utils.test.nextAnimationFrame **/

/**
 * Returns a promise resolved at the next animation frame.
 *
 * @returns {Promise}
 */
export default function nextAnimationFrame() {
    const requestAnimationFrame = owl.Component.scheduler.requestAnimationFrame;
    return new Promise(function (resolve) {
        setTimeout(() => requestAnimationFrame(() => resolve()));
    });
}
