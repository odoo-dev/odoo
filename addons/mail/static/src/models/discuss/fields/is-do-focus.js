/** @odoo-module alias=mail.models.Discuss.fields.isDoFocus **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether this discuss should be focused at next render.
 */
export default attr({
    name: 'isDoFocus',
    id: 'mail.models.Discuss.fields.isDoFocus',
    global: true,
    default: false,
});
