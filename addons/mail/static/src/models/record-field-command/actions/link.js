/** @odoo-module alias=mail.models.RecordFieldCommand.actions.link **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns an 'link' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/link',
    id: 'mail.models.RecordFieldCommand.actions.link',
    global: true,
    /**
     * @param {Object} value
     */
    func(value) {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/link',
                field,
                value,
                options,
            )
        );
    },
});
