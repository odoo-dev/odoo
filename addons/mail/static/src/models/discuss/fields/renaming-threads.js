/** @odoo-module alias=mail.models.Discuss.fields.renamingThreads **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'renamingThreads',
    id: 'mail.models.Discuss.fields.renamingThreads',
    global: true,
    target: 'Thread',
});
