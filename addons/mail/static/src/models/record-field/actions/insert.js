/** @odoo-module alias=mail.models.RecordField.actions.insert **/

import action from 'mail.action.define';

/**
 * Set on this relational field in 'insert' mode. Basically data provided
 * during set on this relational field contain data to insert records,
 * which themselves must be linked to record of this field by means of
 * this field.
 */
export default action({
    name: 'RecordField/insert',
    id: 'mail.model.RecordField.actions.insert',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Object|Object[]} data
     * @param {Object} [options]
     * @returns {boolean} whether the value changed for the current field
     */
    func(
        { env },
        field,
        data,
        options,
    ) {
        const other = env.services.action.dispatch(
            `${field.relModelName}/insert`,
            data,
        );
        return env.services.action.dispatch(
            'RecordField/link',
            field,
            other,
            options,
        );
    },
});
