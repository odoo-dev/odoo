/** @odoo-module alias=mail.models.RecordField.actions._linkX2One **/

import action from 'mail.action.define';

/**
 * Handling of a `set` 'link' of an x2one relational field.
 */
export default action({
    name: 'RecordField/_linkX2One',
    id: 'mail.model.RecordField.actions._linkX2One',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Record} recordToLink
     * @param {Object} [param3={}]
     * @param {boolean} [param3.hasToUpdateInverseFields=true] whether updating the
     *  current field should also update its inverse field. Typically set to
     *  false only during the process of updating the inverse field itself, to
     *  avoid unnecessary recursion.
     * @returns {boolean} whether the value changed for the current field
     */
    func(
        { env },
        field,
        recordToLink,
        { hasToUpdateInverseFields = true } = {},
    ) {
        env.services.action.dispatch(
            'RecordField/_verifyRelationalValue',
            field,
            recordToLink,
        );
        const prevOtherRecord = field.value;
        // other record already linked, avoid linking twice
        if (prevOtherRecord === recordToLink) {
            return false;
        }
        // unlink to properly update previous inverse before linking new value
        env.services.action.dispatch(
            'RecordField/_unlinkX2One',
            field,
            { hasToUpdateInverseFields },
        );
        // link other record to current record
        field.value = recordToLink;
        env.registerUpdatedField(field);
        // link current record to other record
        if (hasToUpdateInverseFields) {
            env.services.action.dispatch(
                'Record/update',
                recordToLink,
                {
                    [field.inverseFieldName]:
                        env.services.action.dispatch(
                            'RecordFieldCommand/link',
                            field.record,
                        ),
                },
                { hasToUpdateInverseFields: false },
            );
        }
        return true;
    },
});
