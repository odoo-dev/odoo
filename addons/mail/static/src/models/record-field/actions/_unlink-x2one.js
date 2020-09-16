/** @odoo-module alias=mail.models.RecordField.actions._unlinkX2One **/

import action from 'mail.action.define';

/**
 * Handling of a `set` 'unlink' of a x2one relational field.
 */
export default action({
    name: 'RecordField/_unlinkX2One',
    id: 'mail.model.RecordField.actions._unlinkX2One',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Object} [param2={}]
     * @param {boolean} [param2.hasToUpdateInverseFields=true] whether updating
     *  the current field should also update its inverse field. Typically set to
     *  false only during the process of updating the inverse field itself, to
     *  avoid unnecessary recursion.
     * @returns {boolean} whether the value changed for the current field
     */
    func(
        { env },
        field,
        { hasToUpdateInverseFields = true } = {},
    ) {
        const otherRecord = field.value;
        // other record already unlinked, avoid useless processing
        if (!otherRecord) {
            return false;
        }
        // unlink other record from current record
        field.value = undefined;
        env.registerUpdatedField(field);
        // unlink current record from other record
        if (hasToUpdateInverseFields) {
            if (
                !env.services.action.dispatch(
                    'Record/exists',
                    otherRecord.localId,
                )
            ) {
                // This case should never happen ideally, but the current
                // way of handling related relational fields make it so that
                // deleted records are not always reflected immediately in
                // these related fields.
                return;
            }
            env.services.action.dispatch(
                'Record/update',
                otherRecord,
                {
                    [field.inverseFieldName]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/unlink',
                            field.record,
                        ),
                },
                { hasToUpdateInverseFields: false },
            );
            // apply causality
            if (field.isCausal) {
                env.services.action.dispatch(
                    'Record/delete',
                    otherRecord,
                );
            }
        }
        return true;
    },
});
