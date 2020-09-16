/** @odoo-module alias=mail.models.RecordField.actions.link **/

import action from 'mail.action.define';

/**
 * Set a 'link' operation on this relational field.
 */
export default action({
    name: 'RecordField/link',
    id: 'mail.model.RecordField.actions.link',
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
                    'RecordField/_linkX2Many',
                    field,
                    value,
                    options,
                );
            case 'many2one':
            case 'one2one':
                return env.services.action.dispatch(
                    'RecordField/_linkX2One',
                    field,
                    value,
                    options,
                );
        }
    },
});
