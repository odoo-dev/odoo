/** @odoo-module alias=mail.models.RecordField.actions.unlink **/

import action from 'mail.action.define';

/**
 * Set an 'unlink' operation on this relational field.
 */
export default action({
    name: 'RecordField/unlink',
    id: 'mail.model.RecordField.actions.unlink',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {RecordField} field
     * @param {Record|Record[]} value
     * @param {Object} [options]
     * @returns {boolean} whether the value changed for the current field
     */
    func(
        { env },
        field,
        value,
        options,
    ) {
        switch (field.relType) {
            case 'many2many':
            case 'one2many':
                return env.services.action.dispatch(
                    'RecordField/_unlinkX2Many',
                    field,
                    value,
                    options,
                );
            case 'many2one':
            case 'one2one':
                return env.services.action.dispatch(
                    'RecordField/_unlinkX2One',
                    field,
                    options,
                );
        }
    },
});
