/** @odoo-module alias=mail.models.Thread.fields.caches **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'caches',
    id: 'mail.models.Thread.fields.caches',
    global: true,
    target: 'ThreadCache',
    inverse: 'thread',
    isCausal: true,
});
