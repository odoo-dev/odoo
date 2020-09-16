/** @odoo-module alias=mail.models.RecordFieldCommand.actions.increment **/

import action from 'mail.action.define';
import RecordFieldCommand from 'mail.classes.RecordFieldCommand';

/**
 * Returns an 'insert' command to give to the model manager at create/update.
 */
export default action({
    name: 'RecordFieldCommand/increment',
    id: 'mail.models.RecordFieldCommand.actions.increment',
    global: true,
    /**
     * @param {integer} [amount=1]
     */
    func(amount = 1) {
        return new RecordFieldCommand(
            (env, field, options) => env.services.action.dispatch(
                'RecordField/set',
                field,
                field.value + amount,
                options,
            ),
        );
    },
});
