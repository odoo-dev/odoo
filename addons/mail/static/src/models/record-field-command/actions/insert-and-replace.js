/** @odoo-module alias=mail.models.RecordFieldCommand.actions.insertAndReplace **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns an 'insert-and-replace' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/insertAndReplace',
    id: 'mail.models.RecordFieldCommand.actions.insertAndReplace',
    global: true,
    /**
     * @param {Object} data
     */
    func(data) {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/insertAndReplace',
                field,
                data,
                options,
            )
        );
    },
});
