/** @odoo-module alias=mail.models.RecordField.actions.read **/

import action from 'mail.action.define';

/**
 * Get the value associated to this field. Relations must convert record
 * local ids to records.
 */
export default action({
    name: 'RecordField/read',
    id: 'mail.model.RecordField.actions.read',
    global: true,
    /**
     * @param {Object} _
     * @param {RecordField} field
     * @param {any} [ctx]
     * @returns {any}
     */
    func(
        _,
        field,
        ctx,
    ) {
        // AKU TODO: register observer if ctx is observer-able
        if (field.type === 'attribute') {
            return field.value;
        }
        if (field.type === 'relation') {
            if (['one2one', 'many2one'].includes(field.relType)) {
                return field.value;
            }
            return [...field.value];
        }
        throw new Error(`cannot read record field with unsupported type ${field.type}.`);
    },
});
