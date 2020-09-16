/** @odoo-module alias=mail.models.ThreadCache.fields.thread **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'thread',
    id: 'mail.models.ThreadCache.fields.thread',
    global: true,
    target: 'Thread',
    inverse: 'caches',
    isId: true,
});
