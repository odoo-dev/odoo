/** @odoo-module alias=mail.utils.isEventHandled **/

import eventHandledWeakMap from 'mail.utils._eventHandledWeakMap';

/**
 * Returns whether the given event has been handled with the given markName.
 *
 * @param {Event} ev
 * @param {string} markName
 * @returns {boolean}
 */
export default function isEventHandled(ev, markName) {
    if (!eventHandledWeakMap.get(ev)) {
        return false;
    }
    return eventHandledWeakMap.get(ev).includes(markName);
}
