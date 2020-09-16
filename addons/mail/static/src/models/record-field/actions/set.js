/** @odoo-module alias=mail.models.RecordField.actions.set **/

import action from 'mail.action.define';
import FieldCommand from 'mail.model.FieldCommand';

/**
 * Set a value on this field. The format of the value comes from business
 * code.
 */
export default action({
    name: 'RecordField/set',
    id: 'mail.model.RecordField.actions.set',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {any} newVal
     * @param {Object} [options]
     * @param {boolean} [options.hasToUpdateInverseFields] whether updating the
     *  current field should also update its inverse field. Only applies to
     *  relational fields. Typically set to false only during the process of
     *  updating the inverse field itself, to avoid unnecessary recursion.
     * @returns {boolean} whether the value changed for the current field
     */
    func(
        { env },
        field,
        newVal,
        options,
    ) {
        /**
         * 0. Manage in case of field command(s).
         */
        if (newVal instanceof FieldCommand) {
            // single command given
            return newVal.execute(env, field, options);
        }
        if (typeof newVal instanceof Array && newVal[0] instanceof FieldCommand) {
            // multi command given
            let hasChanged = false;
            for (const command of newVal) {
                if (command.execute(env, field, options)) {
                    hasChanged = true;
                }
            }
            return hasChanged;
        }
        /**
         * 1. Manage standard cases.
         */
        const currentValue = field.value;
        if (field.type === 'attribute') {
            /**
             * 1.1. Case of attribute.
             */
            if (currentValue === newVal) {
                return false;
            }
            field.value = newVal;
            env.registerUpdatedField(field);
            return true;
        }
        if (field.type === 'relation') {
            throw new Error('Unsupported update on relational field without (list of) command(s)');
        }
    },
});
