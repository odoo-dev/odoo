/** @odoo-module alias=mail.models.Record **/

import model from 'mail.model.define';

export default model({
    name: 'Record',
    id: 'mail.models.Record',
    global: true,
    actions: [
        'mail.models.Record.actions._flush',
        'mail.models.Record.actions.delete',
        'mail.models.Record.actions.deleteAll',
        'mail.models.Record.actions.doAsync',
        'mail.models.Record.actions.update',
    ],
});
