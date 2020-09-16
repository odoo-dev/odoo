/** @odoo-module alias=mail.models.DialogManager.fields.dialogs **/

import one2many from 'mail.model.field.one2many.define';

// FIXME: dependent on implementation that uses insert order in relations!!
export default one2many({
    name: 'dialogs',
    id: 'mail.models.DialogManager.fields.dialogs',
    global: true,
    target: 'Dialog',
    inverse: 'manager',
    isCausal: true,
});
