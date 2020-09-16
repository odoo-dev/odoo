/** @odoo-module alias=mail.models.ThreadCache.fields.isCacheRefreshRequested **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether `this` should consider refreshing its messages.
 * This field is a hint that may or may not lead to an actual refresh.
 * @see `hasToLoadMessages`
 */
export default attr({
    name: 'isCacheRefreshRequested',
    id: 'mail.models.ThreadCache.fields.isCacheRefreshRequested',
    global: true,
    default: false,
});
