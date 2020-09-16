/** @odoo-module alias=mail.models.RecordFieldCommand.actions.unlinkAll **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns an 'unlink-all' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/unlinkAll',
    id: 'mail.models.RecordFieldCommand.actions.unlinkAll',
    global: true,
    func() {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/unlinkAll',
                field,
                options,
            )
        );
    },
});
