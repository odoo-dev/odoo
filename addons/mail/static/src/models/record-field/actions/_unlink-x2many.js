/** @odoo-module alias=mail.models.RecordField.actions._unlinkX2Many **/

import action from 'mail.action.define';

/**
 * Handling of a `set` 'unlink' of a x2many relational field.
 */
export default action({
    name: 'RecordField/_unlinkX2Many',
    id: 'mail.model.RecordField.actions._unlinkX2Many',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Record|Record[]} newValue
     * @param {Object} [param3={}]
     * @param {boolean} [param3.hasToUpdateInverseFields=true] whether updating
     *  the current field should also update its inverse field. Typically set to
     *  false only during the process of updating the inverse field itself, to
     *  avoid unnecessary recursion.
     * @returns {boolean} whether the value changed for the current field
     */
    func(
        { env },
        field,
        newValue,
        { hasToUpdateInverseFields = true } = {},
    ) {
        const recordsToUnlink = env.services.action.dispatch(
            'RecordField/_convertX2ManyValue',
            field,
            newValue,
            { hasToVerify: false },
        );
        const otherRecords = field.value;

        let hasChanged = false;
        for (const recordToUnlink of recordsToUnlink) {
            // unlink other record from current record
            const wasLinked = otherRecords.delete(recordToUnlink);
            if (!wasLinked) {
                continue;
            }
            env.registerUpdatedField(field);
            hasChanged = true;
            // unlink current record from other records
            if (hasToUpdateInverseFields) {
                if (
                    !env.services.action.dispatch(
                        'Record/exists',
                        recordToUnlink.localId,
                    )
                ) {
                    // This case should never happen ideally, but the current
                    // way of handling related relational fields make it so that
                    // deleted records are not always reflected immediately in
                    // these related fields.
                    continue;
                }
                env.services.action.dispatch(
                    'Record/update',
                    recordToUnlink,
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
                        recordToUnlink,
                    );
                }
            }
        }
        return hasChanged;
    },
});
