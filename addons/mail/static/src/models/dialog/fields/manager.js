/** @odoo-module alias=mail.models.Dialog.fields.manager **/

import many2one from 'mail.model.field.many2one.define';

export default many2one({
    name: 'manager',
    id: 'mail.models.Dialog.fields.manager',
    global: true,
    target: 'DialogManager',
    inverse: 'dialogs',
});
