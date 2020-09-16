/** @odoo-module alias=mail.models.RecordFieldCommand.actions.create **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns a 'create' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/create',
    id: 'mail.models.RecordFieldCommand.actions.create',
    global: true,
    /**
     * @param {Object} data
     */
    func(data) {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/create',
                field,
                data,
                options,
            )
        );
    },
});
