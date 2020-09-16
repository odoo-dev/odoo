/** @odoo-module alias=mail.models.Discuss.fields.isOpen **/

import attr from 'mail.model.field.attr.define';

/**
 * Whether the discuss app is open or not. Useful to determine
 * whether the discuss or chat window logic should be applied.
 */
export default attr({
    name: 'isOpen',
    id: 'mail.models.Discuss.fields.isOpen',
    global: true,
    default: false,
});
