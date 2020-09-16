/** @odoo-module alias=mail.models.MessagingMenu.fields.isMobileNewMessageToggled **/

import attr from 'mail.model.field.attr.define';

/**
 * Determine whether the mobile new message input is visible or not.
 */
export default attr({
    name: 'isMobileNewMessageToggled',
    id: 'mail.models.MessagingMenu.fields.isMobileNewMessageToggled',
    global: true,
    default: false,
});
