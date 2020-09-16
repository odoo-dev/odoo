/** @odoo-module alias=mail.models.ThreadCache.fields.isMarkAllAsReadRequested **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether this cache should consider calling "mark all as
 * read" on this thread.
 *
 * This field is a hint that may or may not lead to an actual call.
 * @see `onChangeMarkAllAsRead`
 */
export default attr({
    name: 'isMarkAllAsReadRequested',
    id: 'mail.models.ThreadCache.fields.isMarkAllAsReadRequested',
    global: true,
    default: false,
});
