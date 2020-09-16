/** @odoo-module alias=mail.models.Dialog **/

import model from 'mail.model.define';

export default model({
    name: 'Dialog',
    id: 'mail.models.Dialog',
    global: true,
    fields: [
        'mail.models.Dialog.fields.manager',
        'mail.models.Dialog.fields.record',
    ],
});
