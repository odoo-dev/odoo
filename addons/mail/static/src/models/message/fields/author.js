/** @odoo-module alias=mail.models.Message.fields.author **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'author',
    id: 'mail.models.Message.fields.author',
    global: true,
    target: 'Partner',
    inverse: 'messagesAsAuthor',
});
