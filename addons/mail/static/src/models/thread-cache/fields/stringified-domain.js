/** @odoo-module alias=mail.models.ThreadCache.fields.stringifiedDomain **/

import attr from 'mail.model.field.attr.define';

export default attr({
    name: 'stringifiedDomain',
    id: 'mail.models.ThreadCache.fields.stringifiedDomain',
    global: true,
    default: '[]',
    isId: true,
});
