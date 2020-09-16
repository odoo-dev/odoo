/** @odoo-module alias=mail.models.FollowerSubtype.fields.parentModel **/

import attr from 'mail.model.field.attr.define';

// AKU FIXME: use relation instead
export default attr({
    name: 'parentModel',
    id: 'mail.models.FollowerSubtype.fields.parentModel',
    global: true,
});
