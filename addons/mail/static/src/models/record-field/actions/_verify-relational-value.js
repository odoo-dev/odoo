/** @odoo-module alias=mail.models.RecordField.actions._verifyRelationalValue **/

import action from 'mail.action.define';

/**
 * Verifies the given relational value makes sense for the current field.
 * In particular the given value must be a record, it must be non-deleted,
 * and it must originates from relational `to` model (or its subclasses).
 */
export default action({
    name: 'RecordField/_verifyRelationalValue',
    id: 'mail.model.RecordField.actions._verifyRelationalValue',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Record} record
     * @throws {Error} if record does not satisfy related model
     */
    func(
        { env },
        field,
        record,
    ) {
        if (
            !env.services.action.dispatch(
                'Record/exists',
                record.localId,
                { isCheckingInheritance: true },
            )
        ) {
            throw Error(`Record ${record.localId} is not valid for relational field ${field.name}.`);
        }
    },
});
