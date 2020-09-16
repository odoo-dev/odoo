/** @odoo-module alias=mail.models.RecordFieldCommand.actions.insert **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns an 'insert' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/insert',
    id: 'mail.models.RecordFieldCommand.actions.insert',
    global: true,
    /**
     * @param {Object} data
     */
    'RecordFieldCommand/insert'(data) {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/insert',
                field,
                data,
                options,
            )
        );
    },
});
