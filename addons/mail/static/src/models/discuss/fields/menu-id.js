/** @odoo-module alias=mail.models.Discuss.fields.menuId **/

import attr from 'mail.model.field.attr.define';

/**
 * The menu_id of discuss app, received on mail/init_messaging and
 * used to open discuss from elsewhere.
 */
export default attr({
    name: 'menuId',
    id: 'mail.models.Discuss.fields.menuId',
    global: true,
    default: null,
});
