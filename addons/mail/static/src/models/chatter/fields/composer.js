/** @odoo-module alias=mail.models.Chatter.fields.composer **/

import many2one from 'mail.model.fields.many2one.define';

export default many2one({
    name: 'composer',
    id: 'mail.models.Chatter.fields.composer',
    global: true,
    target: 'Composer',
    related: 'thread.composer',
});
