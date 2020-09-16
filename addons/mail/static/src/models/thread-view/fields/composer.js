/** @odoo-module alias=mail.models.ThreadView.fields.composer **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'composer',
    id: 'mail.models.ThreadView.fields.composer',
    global: true,
    target: 'Composer',
    related: 'thread.composer',
});
