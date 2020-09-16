/** @odoo-module alias=mail.models.MessagingMenu.fields.isOpen **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the messaging menu dropdown is open or not.
 */
export default attr({
    name: 'isOpen',
    id: 'mail.models.MessagingMenu.fields.isOpen',
    global: true,
    default: false,
});
