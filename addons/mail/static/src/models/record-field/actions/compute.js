/** @odoo-module alias=mail.models.RecordField.actions.compute **/

import action from 'mail.action.define';

export default action({
    name: 'RecordField/compute',
    id: 'mail.model.RecordField.actions.compute',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     */
    func(
        { env },
        field,
    ) {
        if (
            !env.services.action.dispatch(
                'RecordField/exists',
                field.record.localId,
            )
        ) {
            throw Error(`Cannot execute computes for already deleted record ${
                field.record.localId
            }.`);
        }
        env.services.action.dispatch(
            'Record/update',
            field.record,
            {
                // AKU TODO
                [field.name]: this._compute(field.record),
            },
        );
    },
});
