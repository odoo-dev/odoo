/** @odoo-module alias=mail.models.Chatter.fields.threadModel **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determines the model of the thread that will be displayed by `this`.
 */
export default attr({
    name: 'threadModel',
    id: 'mail.models.Chatter.fields.threadModel',
    global: true,
});
