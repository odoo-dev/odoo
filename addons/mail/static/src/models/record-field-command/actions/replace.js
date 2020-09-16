/** @odoo-module alias=mail.models.RecordFieldCommand.actions.replace **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns an 'replace' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/replace',
    id: 'mail.models.RecordFieldCommand.actions.replace',
    global: true,
    /**
     * @param {any} [value]
     */
    func(value) {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/replace',
                field,
                value,
                options,
            )
        );
    },
});
