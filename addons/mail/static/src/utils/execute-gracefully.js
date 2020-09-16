/** @odoo-module alias=mail.utils.executeGracefully **/

/**
 * Executes the provided functions in order, but with a potential delay between
 * them if they take too much time. This is done in order to avoid blocking the
 * main thread for too long.
 *
 * @param {function[]} functions
 * @param {integer} [maxTimeFrame=100] time (in ms) until a delay is introduced
 */
export defaullt async function executeGracefully(functions, maxTimeFrame = 100) {
    let startDate = new Date();
    for (const func of functions) {
        if (new Date() - startDate > maxTimeFrame) {
            await new Promise(resolve => setTimeout(resolve));
            startDate = new Date();
        }
        await func();
    }
}
