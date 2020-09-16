/** @odoo-module alias=mail.models.Partner.fields.messagesAsAuthor **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'messagesAsAuthor',
    id: 'mail.models.Partner.fields.messagesAsAuthor',
    global: true,
    target: 'Message',
    inverse: 'author',
});
