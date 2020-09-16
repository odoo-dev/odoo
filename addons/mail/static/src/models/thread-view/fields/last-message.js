/** @odoo-module alias=mail.models.ThreadView.fields.lastMessage **/

import many2one from 'mail.model.field.many2one.define';

/**
 * Last message in the context of the currently displayed thread cache.
 */
export default many2one({
    name: 'lastMessage',
    id: 'mail.models.ThreadView.fields.lastMessage',
    global: true,
    target: 'Message',
    related: 'thread.lastMessage',
});
