/** @odoo-module alias=mail.models.RecordFieldCommand.actions.unlink **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns an 'unlink' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/unlink',
    id: 'mail.models.RecordFieldCommand.actions.unlink',
    global: true,
    /**
     * @param {any} [value]
     */
    func(value) {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/unlink',
                field,
                value,
                options,
            )
        );
    },
});
