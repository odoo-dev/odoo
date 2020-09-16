/** @odoo-module alias=mail.models.RecordFieldCommand.actions.clear **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns a 'clear' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/clear',
    id: 'mail.models.RecordFieldCommand.actions.clear',
    global: true,
    func() {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/clear',
                field,
                options,
            )
        );
    },
});
