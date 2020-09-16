/** @odoo-module alias=mail.models.RecordFieldCommand **/

import model from 'mail.model.define';

export default model({
    name: 'RecordFieldCommand',
    id: 'mail.models.RecordFieldCommand',
    global: true,
    actions: [
        'mail.models.RecordFieldCommand.actions.clear',
        'mail.models.RecordFieldCommand.actions.create',
        'mail.models.RecordFieldCommand.actions.decrement',
        'mail.models.RecordFieldCommand.actions.increment',
        'mail.models.RecordFieldCommand.actions.insert',
        'mail.models.RecordFieldCommand.actions.insertAndReplace',
        'mail.models.RecordFieldCommand.actions.link',
        'mail.models.RecordFieldCommand.actions.replace',
        'mail.models.RecordFieldCommand.actions.unlink',
        'mail.models.RecordFieldCommand.actions.unlinkAll',
    ],
});
