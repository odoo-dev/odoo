/** @odoo-module alias=mail.models.RecordField.actions.insertAndReplace **/

import action from 'mail.action.define';

/**
 * Set on this relational field in 'insert-and-repalce' mode. Basically
 * data provided during set on this relational field contain data to insert
 * records, which themselves must replace value on this field.
 */
export default action({
    name: 'RecordField/insertAndReplace',
    id: 'mail.model.RecordField.actions.insertAndReplace',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {any} data
     * @param {Object} [options]
     */
    func(
        { env },
        field,
        data,
        options,
    ) {
        const newValue = env.services.action.dispatch(
            `${field.relModelName}/insert`,
            data,
        );
        return env.services.action.dispatch(
            'RecordField/replace',
            field,
            newValue,
            options,
        );
    },
});
