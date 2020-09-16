/** @odoo-module alias=mail.models.Composer.fields.thread **/

import one2one from 'mail.model.field.one2one.define';

export default one2one({
    name: 'thread',
    id: 'mail.models.Composer.fields.thread',
    global: true,
    target: 'Thread',
    inverse: 'composer',
    required: true,
});
