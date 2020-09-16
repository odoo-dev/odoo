/** @odoo-module alias=mail.models.RecordField.actions._linkX2Many **/

import action from 'mail.action.define';

/**
 * Handling of a `set` 'link' of a x2many relational field.
 */
export default action({
    name: 'RecordField/_linkX2Many',
    id: 'mail.model.RecordField.actions._linkX2Many',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Record|Record[]} value
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
        value,
        { hasToUpdateInverseFields = true } = {},
    ) {
        const recordsToLink = env.services.action.dispatch(
            'RecordField/_convertX2ManyValue',
            field,
            value,
        );
        const otherRecords = field.value;
        let hasChanged = false;
        for (const recordToLink of recordsToLink) {
            // other record already linked, avoid linking twice
            if (otherRecords.has(recordToLink)) {
                continue;
            }
            hasChanged = true;
            // link other records to current record
            otherRecords.add(recordToLink);
            env.registerUpdatedField(field);
            // link current record to other records
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
        }
        return hasChanged;
    },
});
