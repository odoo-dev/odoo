/** @odoo-module alias=mail.models.Message.fields.checkedThreadCaches **/

import many2many from 'mail.model.field.many2many.define';

export default many2many({
    name: 'checkedThreadCaches',
    id: 'mail.models.Message.fields.checkedThreadCaches',
    global: true,
    target: 'ThreadCache',
    inverse: 'checkedMessages',
});
