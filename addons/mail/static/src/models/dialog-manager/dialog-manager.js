/** @odoo-module alias=mail.models.DialogManager **/

import model from 'mail.model.define';

export default model({
    name: 'DialogManager',
    id: 'mail.models.DialogManager',
    global: true,
    actions: [
        'mail.models.DialogManager.actions.open',
    ],
    fields: [
        'mail.models.DialogManager.fields.dialogs',
    ],
});
