/** @odoo-module alias=mail.models.Chatter.fields.threadId **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determines the id of the thread that will be displayed by `this`.
 */
export default attr({
    name: 'threadId',
    id: 'mail.models.Chatter.fields.threadId',
    global: true,
});
