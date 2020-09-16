/** @odoo-module alias=mail.models.Thread.fields.serverMessageUnreadCounter **/

import attr from 'mail.model.field.attr.define';

/**
 * Message unread counter coming from server.
 *
 * Value of this field is unreliable, due to dynamic nature of
 * messaging. So likely outdated/unsync with server. Should use
 * localMessageUnreadCounter instead, which smartly guess the actual
 * message unread counter at all time.
 *
 * @see localMessageUnreadCounter
 */
export default attr({
    name: 'serverMessageUnreadCounter',
    id: 'mail.models.Thread.fields.serverMessageUnreadCounter',
    global: true,
    default: 0,
});
