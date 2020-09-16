/** @odoo-module alias=mail.models.Thread.fields.threadViews **/

import one2many from 'mail.model.field.one2many.define';

export default one2many({
    name: 'threadViews',
    id: 'mail.models.Thread.fields.threadViews',
    global: true,
    target: 'ThreadView',
    inverse: 'thread',
});
