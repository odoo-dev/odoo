/** @odoo-module alias=mail.models.Chatter.fields.isDoFocus **/

import attr from 'mail.model.fields.attr.define';

/**
 * Determine whether this chatter should be focused at next render.
 */
export default attr({
    name: 'isDoFocus',
    id: 'mail.models.Chatter.fields.isDoFocus',
    global: true,
    default: false,
});
