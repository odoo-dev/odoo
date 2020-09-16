/** @odoo-module alias=mail.models.Partner.fields.correspondentThreads **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'correspondentThreads',
    id: 'mail.models.Partner.fields.correspondentThreads',
    global: true,
    target: 'Thread',
    inverse: 'correspondent',
});
